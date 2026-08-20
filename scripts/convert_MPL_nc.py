#!/usr/bin/env python3
"""
convert_MPL_nc.py — Parse MiniLidar L1 NetCDF files and output JSON to stdout.

Usage:
    python convert_MPL_nc.py \
        --nc_dir   /path/to/sftp/mini_lidar \
        --station  Guanyin \
        --start    2026-04-11T16:00:00Z \
        --end      2026-04-12T15:59:59Z \
        --height_max 1.0 \
        --panels   nrb,depol,temperature,backgroundEnergy
"""

import argparse
import datetime as dt
import json
import math
import os
import re
import shutil
import sys
import tempfile


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--nc_dir",     required=True)
    p.add_argument("--station",    required=True)
    p.add_argument("--start",      required=True, help="UTC ISO-8601")
    p.add_argument("--end",        required=True, help="UTC ISO-8601")
    p.add_argument("--height_max", type=float, default=1.0)
    p.add_argument("--panels",     default="nrb,depol,temperature,backgroundEnergy")
    return p.parse_args()


def iso_to_utc(s: str) -> dt.datetime:
    s = s.replace("Z", "+00:00")
    return dt.datetime.fromisoformat(s).astimezone(dt.timezone.utc).replace(tzinfo=None)


def matlab_doy_to_utc(val: float, year: int) -> dt.datetime:
    """Convert MATLAB-style fractional day-of-year (1-indexed, UTC) to datetime."""
    base = dt.datetime(year, 1, 1)
    return base + dt.timedelta(days=val - 1)


def utc_to_taiwan(utc_dt: dt.datetime) -> dt.datetime:
    return utc_dt + dt.timedelta(hours=8)


def safe_float(v):
    """Return None for inf/nan/-999.99 sentinel."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f) or abs(f - (-999.99)) < 0.01:
        return None
    return f


def safe_log10(v):
    sf = safe_float(v)
    if sf is None or sf <= 0:
        return None
    return math.log10(sf)


def find_nc_files(nc_dir: str, station: str, dates: list) -> list:
    """Return existing .nc paths for given (station, date) pairs.

    Actual filename format: MMPL_L1_NRB_YYYYMMDD_mmpl{SN}_{Station}_V{n}.nc
    We match any .nc file that contains both the 8-digit date string and the
    station name (case-insensitive) rather than requiring an exact name.
    """
    paths = []
    try:
        all_files = [f for f in os.listdir(nc_dir) if f.lower().endswith(".nc")]
    except OSError:
        return paths

    for d in dates:
        date_str = d.strftime("%Y%m%d")
        matched = [
            os.path.join(nc_dir, f)
            for f in all_files
            if date_str in f and station.lower() in f.lower()
        ]
        # Sort for deterministic ordering when multiple versions exist (V1, V2…)
        paths.extend(sorted(matched))
    return paths


def infer_year_from_filename(path: str) -> int:
    m = re.search(r"(\d{8})", os.path.basename(path))
    if m:
        return int(m.group(1)[:4])
    return dt.datetime.utcnow().year


def read_nc(path: str, height_max: float, start_utc: dt.datetime, end_utc: dt.datetime):
    """Read one .nc file and return filtered arrays."""
    try:
        from netCDF4 import Dataset  # type: ignore
    except ImportError:
        raise RuntimeError("netCDF4 package not installed. Run: pip install netCDF4")

    year = infer_year_from_filename(path)

    # netCDF4 on Windows cannot open paths containing non-ASCII characters.
    # Copy to a temp file with a plain ASCII name before opening.
    tmp_path = None
    try:
        suffix = os.path.splitext(path)[1]
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp_path = tmp.name
        shutil.copy2(path, tmp_path)
        open_path = tmp_path
    except Exception:
        open_path = path  # fall back to original path

    try:
        with Dataset(open_path, "r") as ds:
            raw_time  = ds.variables["Time"][:]
            raw_range = ds.variables["range"][:]

            # Height mask
            h_mask = raw_range <= height_max
            ranges  = [float(r) for r in raw_range[h_mask]]

            nrb_co   = ds.variables["NRB_Co"][:, h_mask]   if "NRB_Co"      in ds.variables else None
            nrb_cr   = ds.variables["NRB_Cr"][:, h_mask]   if "NRB_Cr"      in ds.variables else None
            energy   = ds.variables["Energy"][:]            if "Energy"      in ds.variables else None
            las_temp = ds.variables["Las_Temp"][:]          if "Las_Temp"    in ds.variables else None
            det_temp = ds.variables["Det_Temp"][:]          if "Det_Temp"    in ds.variables else None
            box_temp = ds.variables["Box_Temp"][:]          if "Box_Temp"    in ds.variables else None
            bg_avg   = ds.variables["Backgrd_Avg"][:]       if "Backgrd_Avg" in ds.variables else None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    times_utc = [matlab_doy_to_utc(float(t), year) for t in raw_time]

    # Time filter
    t_mask = [start_utc <= t <= end_utc for t in times_utc]
    times_tw = [utc_to_taiwan(t).isoformat(timespec="seconds") + "+08:00"
                for t, keep in zip(times_utc, t_mask) if keep]

    def col(arr):
        if arr is None:
            return None
        return [safe_float(arr[i]) for i, keep in enumerate(t_mask) if keep]

    def mat(arr):
        if arr is None:
            return None
        filtered = [arr[i] for i, keep in enumerate(t_mask) if keep]
        return [[safe_float(v) for v in row] for row in filtered]

    co_f  = mat(nrb_co)
    cr_f  = mat(nrb_cr)

    # Pre-compute depol log10
    depol_z = None
    if co_f is not None and cr_f is not None:
        depol_z = []
        for co_row, cr_row in zip(co_f, cr_f):
            row_out = []
            for co, cr in zip(co_row, cr_row):
                if co is None or cr is None:
                    row_out.append(None)
                else:
                    denom = co + cr
                    if denom <= 1e-11:
                        row_out.append(None)
                    else:
                        ratio = cr / denom
                        row_out.append(safe_log10(ratio))
            depol_z.append(row_out)

    bg_log10 = [safe_log10(bg_avg[i]) if bg_avg is not None else None
                for i, keep in enumerate(t_mask) if keep]

    return {
        "times":    times_tw,
        "ranges":   ranges,
        "nrb_z":    co_f,
        "depol_z":  depol_z,
        "las_temp": col(las_temp),
        "det_temp": col(det_temp),
        "box_temp": col(box_temp),
        "bg_log10": bg_log10,
        "energy":   col(energy),
    }


def merge_chunks(chunks: list) -> dict:
    """Concatenate time-axis across multiple file reads."""
    if not chunks:
        return {}
    merged = {k: [] for k in chunks[0]}
    for c in chunks:
        for k in merged:
            v = c.get(k)
            if v is None:
                continue
            if k == "ranges":
                merged[k] = v   # same across files
            elif isinstance(v, list):
                merged[k].extend(v)
    return merged


def build_output(merged: dict, panels: list, station: str, source_files: list,
                 warnings: list) -> dict:
    times  = merged.get("times", [])
    ranges = merged.get("ranges", [])

    out: dict = {
        "station":     station,
        "timezone":    "Asia/Taipei",
        "rangeKm":     ranges,
        "times":       times,
        "panels":      {},
        "sourceFiles": source_files,
        "warnings":    warnings,
    }

    if "nrb" in panels and merged.get("nrb_z") is not None:
        # Transpose: API expects z[height_idx][time_idx] for Plotly heatmap
        nrb_z = merged["nrb_z"]
        # nrb_z is currently [time][height]; transpose to [height][time]
        if nrb_z and nrb_z[0]:
            nrb_t = [[nrb_z[ti][hi] for ti in range(len(nrb_z))]
                     for hi in range(len(nrb_z[0]))]
        else:
            nrb_t = []
        out["panels"]["nrb"] = {
            "z":        nrb_t,
            "unit":     "MHz Km^2 uJ^-1",
            "colorMin": 0,
            "colorMax": 2,
        }

    if "depol" in panels and merged.get("depol_z") is not None:
        depol_z = merged["depol_z"]
        if depol_z and depol_z[0]:
            depol_t = [[depol_z[ti][hi] for ti in range(len(depol_z))]
                       for hi in range(len(depol_z[0]))]
        else:
            depol_t = []
        out["panels"]["depol"] = {
            "z":        depol_t,
            "scale":    "log10_precomputed",
            "unit":     "ratio",
            "colorMin": math.log10(0.0001),
            "colorMax": math.log10(0.1),
        }

    if "temperature" in panels:
        out["panels"]["temperature"] = {
            "laser":    merged.get("las_temp", []),
            "detector": merged.get("det_temp", []),
            "box":      merged.get("box_temp", []),
            "unit":     "C",
        }

    if "backgroundEnergy" in panels:
        out["panels"]["backgroundEnergy"] = {
            "background_log10": merged.get("bg_log10", []),
            "energy":           merged.get("energy", []),
        }

    return out


def main():
    args   = parse_args()
    panels = [p.strip() for p in args.panels.split(",") if p.strip()]

    start_utc = iso_to_utc(args.start)
    end_utc   = iso_to_utc(args.end)

    # To cover Taiwan 00:00–23:59 we may need UTC-previous-day and UTC-current-day files
    utc_dates = set()
    d = start_utc.date()
    while d <= end_utc.date():
        utc_dates.add(d)
        d += dt.timedelta(days=1)

    nc_paths = find_nc_files(args.nc_dir, args.station, sorted(utc_dates))
    warnings: list = []

    if not nc_paths:
        # Return empty result
        result = {
            "station":     args.station,
            "timezone":    "Asia/Taipei",
            "rangeKm":     [],
            "times":       [],
            "panels":      {},
            "sourceFiles": [],
            "warnings":    [f"查無 {args.station} 在指定日期的資料檔案"],
        }
        print(json.dumps(result))
        return

    chunks = []
    for path in nc_paths:
        try:
            chunk = read_nc(path, args.height_max, start_utc, end_utc)
            chunks.append(chunk)
        except Exception as e:
            warnings.append(f"{os.path.basename(path)} 讀取失敗：{e}")

    merged = merge_chunks(chunks)

    if not merged.get("times"):
        warnings.append("指定時間區間內無資料點")

    source_files = [os.path.basename(p) for p in nc_paths]
    result = build_output(merged, panels, args.station, source_files, warnings)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()