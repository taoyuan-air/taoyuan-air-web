#!/usr/bin/env python3
"""
MAIAC AOD 匯入腳本：建網格 → 匯入 AOD → 計算特徵，一次完成

用法（專案根目錄，資料庫要先執行 database/aod_schema.sql）：
    python scripts/import_maiac_aod.py              # 匯入全部（已完成的會跳過）
    python scripts/import_maiac_aod.py 2024         # 只處理 2024 年
    python scripts/import_maiac_aod.py 2024 --force # 2024 年全部重做

需要的資料：
    data/raw/aod/maiac_crop/<年>/*.npz              # download_maiac.py 產生，或從雲端取得
    data/raw/aod/boundaries/COUNTY_MOI_*.gml        # 內政部縣市界線，用來補 aod_grids.county（可省略）

步驟：
    1. 建立 12,726 個 0.01° 網格（aod_grids），並用縣市界線補上縣市
    2. 讀 npz → QA 過濾 → 網格化 → 寫入 aod_daily_data 的 aod
       - QA：晴空、鄰近正常、AOD 品質最佳
       - 1 km 像元中心落在哪個網格就算進那格；同一次過境取平均，多次過境再取平均
       - 只存有效值，以「日」為單位整天替換，重跑結果一樣
    3. 計算 daod、aod_mean3、aod_std3、aod_mean7、aod_std7、frac3、frac7、aod_valid
"""
import argparse
import os
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import psycopg2
from psycopg2 import sql
from psycopg2.extras import execute_values

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

# ============================================================
# 設定
# ============================================================
CROP_DIR = Path("data/raw/aod/maiac_crop")
BOUNDARY_GLOB = "data/raw/aod/boundaries/COUNTY_MOI_*.gml"

# 0.01° 網格範圍（要與 download_maiac.py 的 BBOX 一致）
LON_MIN, LON_MAX = 120.80, 122.05
LAT_MIN, LAT_MAX = 24.35, 25.35
STEP = 0.01
N_COLS = round((LON_MAX - LON_MIN) / STEP) + 1   # 126
N_ROWS = round((LAT_MAX - LAT_MIN) / STEP) + 1   # 101
TAOYUAN = (121.05, 24.77, 121.50, 25.15)          # PM2.5 補值的桃園範圍（算 dAOD 的 P05 用）

# 資料期間：與 PM2.5 補值資料對齊
START_DATE, END_DATE = date(2019, 1, 1), date(2026, 5, 31)

# NASA 公告 C6.1 在 2022 年 1–5 月 AOD 偏低
KNOWN_ISSUE = (date(2022, 1, 1), date(2022, 5, 31), "C61_2022_LOW_BIAS")

# HDF 原始值
FILL = -28672
VALID_MIN, VALID_MAX = -100, 6000
SATELLITE = {"T": "TERRA", "A": "AQUA"}

# 特徵門檻
MIN_P05_CELLS = 50        # 當天桃園有效格少於這個數，daod 為 NULL（待與模型組確認）
VALID_FRAC3 = 0.5         # aod_valid = frac3 ≥ 0.5（補值報告 7-6）

# MODIS 正弦投影
R = 6371007.181
TILE = 1111950.5197665
X0, Y0 = -20015109.354, 10007554.677
PIX = TILE / 1200


def connect():
    password = os.getenv("POSTGRES_PASSWORD")
    if not password:
        raise SystemExit("找不到 POSTGRES_PASSWORD，請確認專案根目錄的 .env")
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=os.getenv("POSTGRES_PORT", "5432"),
        dbname=os.getenv("POSTGRES_DB", "taoyuan_air"),
        user=os.getenv("POSTGRES_USER", "taoyuan_user"),
        password=password,
    )


def grid_id(row, col):
    """N2477E12105 = 北緯 24.77、東經 121.05"""
    return f"N{round(LAT_MIN * 100) + row:04d}E{round(LON_MIN * 100) + col:05d}"


# ============================================================
# 步驟 1：網格與縣市
# ============================================================
GML_NS = {"p": "http://standards.moi.gov.tw/schema/pub", "gml": "http://www.opengis.net/gml"}


def county_polygons(path):
    """讀內政部縣市界線 GML，回傳 [(縣市名稱, MULTIPOLYGON WKT)]"""
    def ring(r):
        coords = r.find("gml:coordinates", GML_NS).text.split()
        return "(" + ", ".join(c.replace(",", " ") for c in coords) + ")"

    out = []
    for f in ET.parse(path).getroot().findall("gml:featureMember/p:PUB_行政區域", GML_NS):
        polys = []
        for poly in f.iterfind(".//gml:Polygon", GML_NS):
            rings = [ring(poly.find("gml:outerBoundaryIs/gml:LinearRing", GML_NS))]
            rings += [ring(r) for r in poly.iterfind("gml:innerBoundaryIs/gml:LinearRing", GML_NS)]
            polys.append("(" + ", ".join(rings) + ")")
        out.append((f.find("p:名稱", GML_NS).text.strip(), "MULTIPOLYGON(" + ", ".join(polys) + ")"))
    return out


def init_grids(conn):
    w, s, e, n = TAOYUAN
    rows = []
    for r in range(N_ROWS):
        lat = round(LAT_MIN + r * STEP, 2)
        for c in range(N_COLS):
            lon = round(LON_MIN + c * STEP, 2)
            rows.append((grid_id(r, c), r, c, lat, lon, lon, lat, (w <= lon <= e) and (s <= lat <= n)))

    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO aod_grids (grid_id, grid_row, grid_col, latitude, longitude, location, in_taoyuan_grid)
            VALUES %s
            ON CONFLICT (grid_id) DO UPDATE SET in_taoyuan_grid = EXCLUDED.in_taoyuan_grid, updated_at = NOW()
        """, rows, template="(%s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s)",
            page_size=2000)

        gml = sorted(Path().glob(BOUNDARY_GLOB))
        if gml:
            # 縣市界線只在這裡暫時用，不留在資料庫
            # TWD97 經緯度（EPSG:3824）與 WGS84 差距在 1 公尺以內，直接當 4326 用
            cur.execute("CREATE TEMP TABLE tmp_county (name VARCHAR(20), geom GEOMETRY)")
            for name, wkt in county_polygons(gml[-1]):
                cur.execute("INSERT INTO tmp_county VALUES (%s, ST_MakeValid(ST_GeomFromText(%s, 4326)))",
                            (name, wkt))
            cur.execute("""
                UPDATE aod_grids g SET county = t.name, updated_at = NOW()
                FROM tmp_county t WHERE ST_Intersects(t.geom, g.location)
            """)
            cur.execute("DROP TABLE tmp_county")
            cur.execute("SELECT COUNT(county) FROM aod_grids")
            print(f"[1/3] 網格：{len(rows)} 格，其中 {cur.fetchone()[0]} 格補上縣市（{gml[-1].name}）")
        else:
            print(f"[1/3] 網格：{len(rows)} 格（找不到 {BOUNDARY_GLOB}，縣市欄位維持空白）")
    conn.commit()


# ============================================================
# 步驟 2：匯入 AOD
# ============================================================
_cell_cache = {}


def pixel_cells(tile, row0, col0, shape):
    """每個 1 km 像元中心對應的網格索引（row * N_COLS + col），範圍外為 -1"""
    key = (tile, row0, col0, shape)
    if key not in _cell_cache:
        h, v = int(tile[1:3]), int(tile[4:6])
        rows = np.arange(shape[0]) + row0
        cols = np.arange(shape[1]) + col0
        y = Y0 - v * TILE - (rows[:, None] + 0.5) * PIX
        x = X0 + h * TILE + (cols[None, :] + 0.5) * PIX
        lat = np.degrees(y / R) * np.ones_like(x)
        lon = np.degrees(x / (R * np.cos(np.radians(lat))))
        gr = np.rint(lat * 100).astype(int) - round(LAT_MIN * 100)
        gc = np.rint(lon * 100).astype(int) - round(LON_MIN * 100)
        inside = (gr >= 0) & (gr < N_ROWS) & (gc >= 0) & (gc < N_COLS)
        _cell_cache[key] = np.where(inside, gr * N_COLS + gc, -1)
    return _cell_cache[key]


def qa_pass(qa):
    cloud = qa & 0b111                 # 位元 0–2：1 = 晴空
    adjacency = (qa >> 5) & 0b111      # 位元 5–7：0 = 正常
    quality = (qa >> 8) & 0b1111       # 位元 8–11：0 = 最佳
    return (cloud == 1) & (adjacency == 0) & (quality == 0)


def file_date(name):
    m = re.search(r"\.A(\d{4})(\d{3})\.", name)
    return date(int(m.group(1)), 1, 1) + timedelta(days=int(m.group(2)) - 1)


def day_aod(files):
    """回傳 {(衛星, 網格索引): AOD}"""
    per_pass = defaultdict(lambda: [0.0, 0])   # (衛星, 過境時間, 網格) -> [總和, 個數]
    for f in files:
        z = np.load(f)
        cells = pixel_cells(str(z["tile"]), int(z["row0"]), int(z["col0"]), z["aod_055"].shape[1:])
        inside = cells >= 0
        for k, stamp in enumerate(str(o) for o in z["orbits"]):
            sat = SATELLITE.get(stamp[-1])
            if sat is None:
                continue
            a, q = z["aod_055"][k], z["aod_qa"][k]
            ok = inside & (a != FILL) & (a >= VALID_MIN) & (a <= VALID_MAX) & qa_pass(q)
            if not ok.any():
                continue
            c = cells[ok]
            sums = np.bincount(c, weights=a[ok].astype(np.float64) * 0.001)
            cnts = np.bincount(c)
            for cell in np.nonzero(cnts)[0]:
                acc = per_pass[(sat, stamp[:11], int(cell))]
                acc[0] += sums[cell]
                acc[1] += int(cnts[cell])

    means = defaultdict(list)
    for (sat, _, cell), (s, n) in per_pass.items():
        means[(sat, cell)].append(s / n)
    return {key: float(np.mean(v)) for key, v in means.items()}


def import_aod(conn, years, force):
    files = sorted(CROP_DIR.glob("*/*.npz"))
    if years:
        files = [f for f in files if f.parent.name in years]
    by_day = defaultdict(list)
    for f in files:
        d = file_date(f.name)
        if START_DATE <= d <= END_DATE:
            by_day[d].append(f)
    if not by_day:
        raise SystemExit(f"在 {CROP_DIR} 找不到 {START_DATE} – {END_DATE} 的 npz 檔")

    cur = conn.cursor()
    cur.execute("SELECT DISTINCT obs_date FROM aod_daily_data")
    have = {r[0] for r in cur.fetchall()}
    todo = [d for d in sorted(by_day) if force or d not in have]
    print(f"[2/3] 匯入 AOD：共 {len(by_day)} 天，這次要匯入 {len(todo)} 天")

    total = 0
    for i, d in enumerate(todo, 1):
        issue = KNOWN_ISSUE[2] if KNOWN_ISSUE[0] <= d <= KNOWN_ISSUE[1] else None
        rows = [(grid_id(*divmod(cell, N_COLS)), d, sat, round(v, 4), issue)
                for (sat, cell), v in day_aod(by_day[d]).items()]

        start = d.replace(day=1)
        end = (start + timedelta(days=32)).replace(day=1)
        cur.execute(sql.SQL(
            "CREATE TABLE IF NOT EXISTS {} PARTITION OF aod_daily_data FOR VALUES FROM (%s) TO (%s)"
        ).format(sql.Identifier(f"aod_daily_data_{start:%Y_%m}")), (start, end))
        cur.execute("DELETE FROM aod_daily_data WHERE obs_date = %s", (d,))
        if rows:
            execute_values(cur, """
                INSERT INTO aod_daily_data (grid_id, obs_date, satellite_id, aod, known_issue) VALUES %s
            """, rows, page_size=5000)
        conn.commit()
        total += len(rows)
        if i % 30 == 0 or i == len(todo):
            print(f"      {i}/{len(todo)} 天，到 {d}，累計 {total:,} 筆")
    cur.close()


# ============================================================
# 步驟 3：計算特徵
# ============================================================
def window_stats(arr, k):
    """arr 中 NaN = 無效。回傳 k×k 視窗的 (平均, 母體標準差, 有效比例)；超出範圍視為無效"""
    r = k // 2
    valid = ~np.isnan(arr)
    v = np.where(valid, arr, 0.0)

    def box(x):
        p = np.pad(x, r + 1)[: x.shape[0] + 2 * r + 1, : x.shape[1] + 2 * r + 1]
        c = p.cumsum(0).cumsum(1)
        return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]

    n = box(valid.astype(np.float64))
    s, s2 = box(v), box(v * v)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = np.where(n > 0, s / n, np.nan)
        var = np.where(n >= 2, np.maximum(s2 / n - mean * mean, 0.0), np.nan)
    return mean, np.sqrt(var), n / (k * k)


def r4(x):
    return None if np.isnan(x) else round(float(x), 4)


def build_features(conn, years, force):
    cur = conn.cursor()
    where = "TRUE" if force else "frac3 IS NULL"
    if years:
        where += f" AND EXTRACT(YEAR FROM obs_date) IN ({','.join(str(int(y)) for y in years)})"
    cur.execute(f"SELECT DISTINCT obs_date, satellite_id FROM aod_daily_data WHERE {where} ORDER BY 1, 2")
    todo = cur.fetchall()
    print(f"[3/3] 計算特徵：{len(todo)} 組（日期 × 衛星）")

    for i, (d, sat) in enumerate(todo, 1):
        cur.execute("""
            SELECT d.grid_id, g.grid_row, g.grid_col, d.aod, g.in_taoyuan_grid
            FROM aod_daily_data d JOIN aod_grids g USING (grid_id)
            WHERE d.obs_date = %s AND d.satellite_id = %s
        """, (d, sat))
        data = cur.fetchall()
        rows = np.array([x[1] for x in data])
        cols = np.array([x[2] for x in data])
        aod = np.array([float(x[3]) for x in data])
        ty = np.array([x[4] for x in data], dtype=bool)

        grid = np.full((N_ROWS, N_COLS), np.nan)
        grid[rows, cols] = aod
        m3, s3, f3 = window_stats(grid, 3)
        m7, s7, f7 = window_stats(grid, 7)
        p05 = np.percentile(aod[ty], 5) if ty.sum() >= MIN_P05_CELLS else None

        updates = [(
            data[j][0], d, sat,
            None if p05 is None else round(float(aod[j] - p05), 4),
            r4(m3[r, c]), r4(s3[r, c]), r4(m7[r, c]), r4(s7[r, c]),
            round(float(f3[r, c]), 3), round(float(f7[r, c]), 3), bool(f3[r, c] >= VALID_FRAC3),
        ) for j, (r, c) in enumerate(zip(rows, cols))]
        execute_values(cur, """
            UPDATE aod_daily_data AS t SET
                daod = v.daod::numeric, aod_mean3 = v.m3::numeric, aod_std3 = v.s3::numeric,
                aod_mean7 = v.m7::numeric, aod_std7 = v.s7::numeric,
                frac3 = v.f3::numeric, frac7 = v.f7::numeric, aod_valid = v.ok::boolean,
                updated_at = NOW()
            FROM (VALUES %s) AS v (grid_id, obs_date, sat, daod, m3, s3, m7, s7, f3, f7, ok)
            WHERE t.grid_id = v.grid_id AND t.obs_date = v.obs_date AND t.satellite_id = v.sat
        """, updates, page_size=5000)
        conn.commit()
        if i % 60 == 0 or i == len(todo):
            print(f"      {i}/{len(todo)}，到 {d}")
    cur.close()


# ============================================================
def main():
    ap = argparse.ArgumentParser(description="MAIAC AOD 匯入：建網格 → 匯入 AOD → 計算特徵")
    ap.add_argument("years", nargs="*", help="只處理這些年份，例如 2024 2025")
    ap.add_argument("--force", action="store_true", help="已完成的日期也重做")
    args = ap.parse_args()

    conn = connect()
    try:
        init_grids(conn)
        import_aod(conn, args.years, args.force)
        build_features(conn, args.years, args.force)
    finally:
        conn.close()
    print("全部完成")


if __name__ == "__main__":
    main()
