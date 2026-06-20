#!/usr/bin/env python3
"""
TYDEP（桃園市環保局）測站資料轉換腳本（原 TEPA）
將 Excel 原始資料轉換為按測站+月份分割的 JSON 檔

輸入：data/raw/tydep-stations/桃園市空氣品質測站監測數據(108-115).xlsx
輸出：data/processed/tydep-stations/json/<station_id>/<YYYY_MM>.json

保留污染物（對齊 MOE/CWA 六項）：
  SO2, CO, O3, NO2, PM10, PM2.5

時間範圍：2019-03-01 起
"""

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

DATA_START = datetime(2019, 3, 1)

ROOT_DIR = Path(__file__).parent.parent
INPUT_FILE = ROOT_DIR / "data" / "raw" / "tydep-stations" / "桃園市空氣品質測站監測數據(108-115).xlsx"
OUTPUT_DIR = ROOT_DIR / "data" / "processed" / "tydep-stations" / "json"

STATION_MAP = {
    "(局)新興國小": {"id": "0604616A0002", "name": "新興國小", "district": "蘆竹區"},
    "(局)內壢":     {"id": "0604316A0003", "name": "內壢",     "district": "中壢區"},
    "(局)華亞":     {"id": "0604816I0005", "name": "華亞",     "district": "龜山區"},
    "(局)觀音":     {"id": "0605316I0004", "name": "觀音_S",   "district": "觀音區"},
}

COL = {
    "datetime": 0,
    "date":     1,
    "station":  2,
    "so2":      6,
    "co":       7,
    "o3":       8,
    "no2":      4,
    "pm25":     12,
    "pm10":     13,
    "rh":       14,
    "at":       15,
    "wd":       16,
    "ws":       17,
}

INVALID_TOKENS = {"無資料", "缺值", "維修", "校正", "#", "N/A", ""}


def to_float(val) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip()
    if s in INVALID_TOKENS:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_row(row: tuple) -> Optional[dict]:
    raw_dt = row[COL["datetime"]]
    if not isinstance(raw_dt, datetime):
        return None
    if raw_dt < DATA_START:
        return None

    station_raw = row[COL["station"]]
    if station_raw not in STATION_MAP:
        return None

    station_info = STATION_MAP[station_raw]

    return {
        "station_id":   station_info["id"],
        "station_name": station_info["name"],
        "monitor_date": raw_dt.strftime("%Y-%m-%dT%H:%M:%S"),
        "pollutants": {
            "so2":  to_float(row[COL["so2"]]),
            "co":   to_float(row[COL["co"]]),
            "o3":   to_float(row[COL["o3"]]),
            "no2":  to_float(row[COL["no2"]]),
            "pm25": to_float(row[COL["pm25"]]),
            "pm10": to_float(row[COL["pm10"]]),
        },
        "meteo": {
            "rh": to_float(row[COL["rh"]]),
            "at": to_float(row[COL["at"]]),
            "wd": row[COL["wd"]] if row[COL["wd"]] not in INVALID_TOKENS else None,
            "ws": to_float(row[COL["ws"]]),
        },
    }


def parse_xlsx_to_records(filepath: Path) -> tuple[list[dict], int]:
    """Parse the TYDEP Excel source into normalized records."""
    try:
        import openpyxl
    except ImportError:
        print("請先安裝 openpyxl：pip3 install openpyxl")
        sys.exit(1)

    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    print(f"工作表：{ws.title}")

    records = []
    skipped = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        record = parse_row(row)
        if record is None:
            skipped += 1
            continue
        records.append(record)

    wb.close()
    return records, skipped


def bucket_records(records: list[dict]) -> dict:
    buckets: dict = defaultdict(lambda: defaultdict(list))
    for record in records:
        dt = datetime.fromisoformat(record["monitor_date"])
        month_key = dt.strftime("%Y_%m")
        buckets[record["station_id"]][month_key].append(record)
    return buckets


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def write_monthly_json_files(records: list[dict], output_dir: Path) -> tuple[dict, int]:
    buckets = bucket_records(records)
    file_count = 0

    output_dir.mkdir(parents=True, exist_ok=True)

    for station_id, months in sorted(buckets.items()):
        station_dir = output_dir / station_id
        station_meta = next(v for v in STATION_MAP.values() if v["id"] == station_id)

        for month_key, records in sorted(months.items()):
            records.sort(key=lambda r: r["monitor_date"])
            output = {
                "meta": {
                    "station_id":   station_id,
                    "station_name": station_meta["name"],
                    "district":     station_meta["district"],
                    "source":       "TYDEP",
                    "month":        month_key.replace("_", "-"),
                    "record_count": len(records),
                    "generated_at": datetime.now().isoformat(),
                },
                "records": records,
            }

            write_json(station_dir / f"{month_key}.json", output)
            file_count += 1

    return buckets, file_count


def write_stations_meta(buckets: dict, output_dir: Path) -> Path:
    stations_meta = []
    for raw_name, info in STATION_MAP.items():
        station_id = info["id"]
        if station_id in buckets:
            months = sorted(buckets[station_id].keys())
            stations_meta.append({
                "station_id":   station_id,
                "station_name": info["name"],
                "district":     info["district"],
                "raw_name":     raw_name,
                "source":       "TYDEP",
                "data_start":   months[0].replace("_", "-") if months else None,
                "data_end":     months[-1].replace("_", "-") if months else None,
                "total_months": len(months),
                "total_records": sum(len(r) for r in buckets[station_id].values()),
            })

    meta_path = output_dir / "stations_meta.json"
    write_json(meta_path, stations_meta)
    return meta_path


def process_file(filepath: Path, output_dir: Path) -> dict:
    print(f"讀取：{filepath}")
    if not filepath.exists():
        print(f"[錯誤] 找不到輸入檔案：{filepath}")
        sys.exit(1)

    records, skipped = parse_xlsx_to_records(filepath)
    print(f"解析完成：{len(records):,} 筆有效，{skipped:,} 筆跳過")

    buckets, file_count = write_monthly_json_files(records, output_dir)
    print(f"輸出完成：{file_count} 個 JSON 檔 → {output_dir}")

    meta_path = write_stations_meta(buckets, output_dir)
    print(f"測站 meta：{meta_path}")
    return {"raw": len(records), "skipped": skipped, "files": file_count}


def main():
    parser = argparse.ArgumentParser(description="TYDEP Excel to JSON converter")
    parser.add_argument("--file", type=Path, default=INPUT_FILE, help="單一 Excel 檔案路徑")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR, help="JSON 輸出目錄")
    args = parser.parse_args()

    process_file(args.file, args.output_dir)


if __name__ == "__main__":
    main()
