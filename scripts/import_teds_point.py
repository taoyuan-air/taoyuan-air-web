#!/usr/bin/env python3
"""
TEDS 點源排放清冊匯入腳本
處理流程：CSV → JSON 落地 → PostgreSQL 批次匯入
目標：全台排放源，對應資料庫版本 TEDS12 (2021發布資料)
"""

import os
import argparse
import json
import logging
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# 載入環境變數
load_dotenv()

# 檢查必要的環境變數
required_env_vars = ['POSTGRES_PASSWORD']
missing_vars = [var for var in required_env_vars if not os.getenv(var)]
if missing_vars:
    print(f"[ERROR] 缺少必要的環境變數: {', '.join(missing_vars)}")
    print("請確認 .env 檔案中已設定以下變數:")
    for var in missing_vars:
        print(f"  {var}=your_actual_password")
    exit(1)

# ===========================================================
# 1. 資料庫連線設定
# ===========================================================
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': os.getenv('POSTGRES_PORT', '5432'),
    'database': os.getenv('POSTGRES_DB', 'taoyuan_air'),
    'user': os.getenv('POSTGRES_USER', 'taoyuan_user'),
    'password': os.getenv('POSTGRES_PASSWORD')  # 不提供預設值，強制使用環境變數
}

# ===========================================================
# 2. 常數設定
# ===========================================================

# TEDS CSV 欄位 → 污染物代碼 對應表
EMISSION_COLS = {
    "TSP_EMI":  "TSP",
    "PM_EMI":   "PM10",
    "PM25_EMI": "PM25",
    "SOX_EMI":  "SOX",
    "NOX_EMI":  "NOX",
    "THC_EMI":  "THC",
    "NMHC_EMI": "NMHC",
    "CO_EMI":   "CO",
    "PB_EMI":   "PB",
}

# TEDS 站點欄位：CSV 欄位名 → 資料庫欄位名
STATION_COL_MAP = {
    "SERIAL_NO":  "serial_no",
    "C_NO":       "c_no",
    "COMP_NAM":   "comp_nam",
    "COMP_KIND1": "comp_kind1",
    "WGS84_N":    "latitude",
    "WGS84_E":    "longitude",
    "HEI":        "stack_height",
}

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ===========================================================
# 3. 資料清洗工具函式
# ===========================================================

def safe_float(val, fill_zero: bool = True) -> tuple[float | None, str]:
    """
    清洗排放量數值：
    - NaN / 空值 → 依 fill_zero 決定填 0.0 或 None
    - 負值（異常代碼）→ fill_zero=True 填 0.0，否則 None，quality='invalid'
    - 正常數值 → 原值，quality='good'
    """
    if pd.isna(val) or val is None:
        return (0.0 if fill_zero else None, "invalid")
    try:
        numeric = float(val)
        if numeric < 0:
            return (0.0 if fill_zero else None, "invalid")
        return (numeric, "good")
    except (ValueError, TypeError):
        return (0.0 if fill_zero else None, "invalid")


def safe_scalar(val):
    """清洗一般字串/數值欄位：NaN → None"""
    if pd.isna(val):
        return None
    v = str(val).strip()
    return v if v else None


def safe_numeric(val):
    """清洗數值型欄位：NaN → None，負值保留（如溫度可為負）"""
    if pd.isna(val) or val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None

# ===========================================================
# 4. CSV → JSON 轉換（JSON 落地步驟）
# ===========================================================

def csv_to_json(csv_path: Path, json_path: Path) -> list[dict]:
    log.info(f"▶ 讀取 CSV：{csv_path.name}")
    df = pd.read_csv(csv_path, low_memory=False)
    log.info(f"  全台灣總筆數：{len(df)}")

    records = []
    for _, row in df.iterrows():
        station = {}
        for csv_col, db_col in STATION_COL_MAP.items():
            station[db_col] = safe_scalar(row.get(csv_col))

        emissions = {}
        for csv_col, obs_id in EMISSION_COLS.items():
            val, quality = safe_float(row.get(csv_col), fill_zero=True)
            emissions[obs_id] = {"value": val, "quality": quality}

        records.append({"station": station, "emissions": emissions})

    json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    log.info(f"  💾 JSON 已落地：{json_path}")
    return records

# ===========================================================
# 5. 資料庫操作
# ===========================================================

def insert_stations(conn, stations: list[dict]) -> dict[int, int]:
    sql = """
        INSERT INTO teds_stations (
            serial_no, c_no, comp_nam, comp_kind1, 
            latitude, longitude, stack_height
        ) VALUES %s
        ON CONFLICT DO NOTHING;
    """
    rows = []
    for s in stations:
        rows.append((
            s.get("serial_no"), s.get("c_no"), s.get("comp_nam"), s.get("comp_kind1"),
            safe_numeric(s.get("latitude")), safe_numeric(s.get("longitude")), 
            safe_numeric(s.get("stack_height"))
        ))

    with conn.cursor() as cur:
        execute_values(cur, sql, rows)
    
    log.info(f" 🏭 正在同步測站對照表...")
    return fetch_existing_stations(conn)


def update_station_locations(conn):
    """更新 teds_stations.location 幾何欄位（PostGIS）"""
    sql = """
        UPDATE teds_stations
        SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
        WHERE location IS NULL
          AND longitude IS NOT NULL
          AND latitude IS NOT NULL;
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        log.info(f"  🌐 更新 PostGIS 幾何欄位：{cur.rowcount} 筆")


def insert_emissions(conn, records: list[dict], serial_to_station: dict, batch_size: int) -> int:
    sql = """
        INSERT INTO teds_emission_data (station_id, observation_id, emission_value, data_quality)
        VALUES %s
        ON CONFLICT (station_id, observation_id) DO NOTHING;
    """
    all_rows = []
    missing_serial = set()

    for rec in records:
        s = rec["station"]
        serial_no = s.get("serial_no")
        if serial_no:
            serial_no = int(serial_no)
        
        station_id = serial_to_station.get(serial_no)

        if not station_id:
            missing_serial.add(serial_no)
            continue

        for obs_id, data in rec["emissions"].items():
            all_rows.append((
                station_id,
                obs_id,
                data["value"],
                data["quality"]
            ))

    if missing_serial:
        log.warning(f"  ⚠️  找不到 station_id 的 serial_no 數量：{len(missing_serial)}（已略過）")

    with conn.cursor() as cur:
        for i in range(0, len(all_rows), batch_size):
            batch = all_rows[i: i + batch_size]
            execute_values(cur, sql, batch, page_size=batch_size)

    return len(all_rows)

def fetch_existing_stations(conn) -> dict[int, int]:
    """
    從 DB 取得已存在的 serial_no → station_id 對應（補齊 ON CONFLICT 略過的站點）。
    """
    with conn.cursor() as cur:
        cur.execute("SELECT station_id, serial_no FROM teds_stations WHERE serial_no IS NOT NULL;")
        return {row[1]: row[0] for row in cur.fetchall()}

# ===========================================================
# 6. 主處理流程
# ===========================================================

def process(csv_path: Path, json_dir: Path, batch_size: int):
    # Step 1：CSV → JSON
    json_path = json_dir / (csv_path.stem + ".json")
    records = csv_to_json(csv_path, json_path)

    try:
        conn = psycopg2.connect(**DB_CONFIG)

        # Step 2：匯入站點
        stations = [rec["station"] for rec in records]
        serial_to_station = insert_stations(conn, stations)
        conn.commit()

        # Step 3：匯入排放量
        log.info(f"▶ 批次匯入排放量資料...")
        inserted = insert_emissions(conn, records, serial_to_station, batch_size)
        conn.commit()
        log.info(f"✅ 成功插入排放量記錄：{inserted} 筆")

        # Step 4：更新座標幾何
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE teds_stations SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
                WHERE location IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL;
            """)
        conn.commit()

        conn.close()
    except Exception as e:
        log.error(f"❌ 匯入失敗：{e}")

# ===========================================================
# 主程式
# ===========================================================

def main():
    parser = argparse.ArgumentParser(description="TEDS 全台匯入腳本")
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--json-dir", type=Path, default=Path("./data/raw/teds-point/json/"))
    parser.add_argument("--batch-size", type=int, default=5000)
    args = parser.parse_args()

    # 執行處理
    process(args.csv, args.json_dir, args.batch_size)

if __name__ == "__main__":
    main()
