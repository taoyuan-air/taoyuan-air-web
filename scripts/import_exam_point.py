#!/usr/bin/env python3
"""
固定污染源檢測資料匯入腳本 (戴奧辛、重金屬及氯化氫)
處理流程：CSV 直接讀取 → PostgreSQL 批次匯入 (無 JSON 落地)
系統：3D Geo-AI 大氣品質預測系統 (底層資料庫)
"""

import os
import argparse
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
    'password': os.getenv('POSTGRES_PASSWORD') 
}

# ===========================================================
# 2. 常數設定
# ===========================================================
# 檢測項目中文 → 資料庫標準代碼 (item_id) 對應表
ITEM_MAPPING = {
    "戴奧辛及其化合物": "DIOXIN",
    "汞及其化合物": "HG",
    "鉛及其化合物": "PB",
    "鎘及其化合物": "CD",
    "氯化氫": "HCL"
}

# Logging 設定
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ===========================================================
# 3. 資料庫操作函式
# ===========================================================

def insert_sources(conn, df: pd.DataFrame) -> dict[tuple, int]:
    """匯入排放管道並回傳 (ems_no, emi_chimney) -> source_id 的對應表"""
    sql = """
        INSERT INTO exam_sources (ems_no, fac_name, emi_chimney, latitude, longitude)
        VALUES %s
        ON CONFLICT (ems_no, emi_chimney) DO UPDATE SET 
            fac_name = EXCLUDED.fac_name,
            latitude = COALESCE(EXCLUDED.latitude, exam_sources.latitude),
            longitude = COALESCE(EXCLUDED.longitude, exam_sources.longitude),
            updated_at = NOW();
    """
    
    # 提取不重複的排放源
    sources_df = df[['ems_no', 'fac_name', 'emi_chimney', 'Lat', 'Lon']].drop_duplicates(subset=['ems_no', 'emi_chimney'])
    
    # 過濾掉無效資料
    sources_df = sources_df.dropna(subset=['ems_no', 'emi_chimney'])
    
    rows = [
        (row['ems_no'], row['fac_name'], row['emi_chimney'], 
         row['Lat'] if pd.notna(row['Lat']) else None, 
         row['Lon'] if pd.notna(row['Lon']) else None)
        for _, row in sources_df.iterrows()
    ]

    log.info(f" 🏭 準備匯入/更新 {len(rows)} 筆排放源基本資料...")
    with conn.cursor() as cur:
        execute_values(cur, sql, rows)
    
    return fetch_existing_sources(conn)


def fetch_existing_sources(conn) -> dict[tuple, int]:
    """從 DB 取得已存在的 (ems_no, emi_chimney) → source_id 對應"""
    with conn.cursor() as cur:
        cur.execute("SELECT source_id, ems_no, emi_chimney FROM exam_sources;")
        return {(row[1], row[2]): row[0] for row in cur.fetchall()}


def insert_records(conn, df: pd.DataFrame, source_mapping: dict, batch_size: int) -> int:
    """批次匯入檢測紀錄明細"""
    sql = """
        INSERT INTO exam_records (source_id, item_id, exam_date, exam_value, exam_units, exam_status)
        VALUES %s
        ON CONFLICT (source_id, item_id, exam_date) DO UPDATE SET 
            exam_value = EXCLUDED.exam_value,
            exam_units = EXCLUDED.exam_units,
            exam_status = EXCLUDED.exam_status;
    """
    all_rows = []
    missing_source = set()

    for _, row in df.iterrows():
        # 清洗與轉換
        raw_item = str(row.get('exam_item')).strip()
        item_id = ITEM_MAPPING.get(raw_item, "UNKNOWN")
        exam_date = row.get('exam_date')
        
        # 略過無效資料
        if item_id == "UNKNOWN" or pd.isna(exam_date):
            continue

        # 找對應的 source_id
        key = (row.get('ems_no'), row.get('emi_chimney'))
        source_id = source_mapping.get(key)

        if not source_id:
            missing_source.add(key)
            continue

        val = row.get('exam_value')
        exam_value = float(val) if pd.notna(val) else None
        
        unit = row.get('exam_units')
        exam_units = str(unit).strip() if pd.notna(unit) else None
        
        status = row.get('exam_status')
        exam_status = str(status).strip() if pd.notna(status) else None

        # 日期格式化為字串 YYYY-MM-DD
        formatted_date = pd.to_datetime(exam_date).strftime('%Y-%m-%d')

        all_rows.append((source_id, item_id, formatted_date, exam_value, exam_units, exam_status))

    if missing_source:
        log.warning(f"  ⚠️  找不到對應 source_id 的管道數量：{len(missing_source)}（已略過這些紀錄）")

    log.info(f" 📝 準備批次匯入 {len(all_rows)} 筆檢測紀錄...")
    with conn.cursor() as cur:
        for i in range(0, len(all_rows), batch_size):
            batch = all_rows[i: i + batch_size]
            execute_values(cur, sql, batch, page_size=batch_size)

    return len(all_rows)

# ===========================================================
# 4. 主處理流程
# ===========================================================

def process(csv_path: Path, batch_size: int):
    log.info(f"▶ 開始讀取 CSV：{csv_path.name}")
    try:
        df = pd.read_csv(csv_path, low_memory=False)
        log.info(f"  📊 原始資料總筆數：{len(df)}")
    except Exception as e:
        log.error(f"❌ 讀取 CSV 失敗：{e}")
        return

    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = False

        # Step 1：匯入排放源
        source_mapping = insert_sources(conn, df)
        conn.commit()

        # Step 2：匯入檢測紀錄
        inserted = insert_records(conn, df, source_mapping, batch_size)
        conn.commit()
        log.info(f"✅ 成功插入/更新檢測記錄：{inserted} 筆")

        # Step 3：更新座標幾何
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE exam_sources 
                SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
                WHERE location IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL;
            """)
            log.info(f"  🌐 更新 PostGIS 幾何欄位：{cur.rowcount} 筆")
        conn.commit()

    except Exception as e:
        if conn:
            conn.rollback()
        log.error(f"❌ 資料庫匯入失敗：{e}")
    finally:
        if conn:
            conn.close()
            log.info("🔒 資料庫連線已關閉。")

# ===========================================================
# 執行進入點
# ===========================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="固定污染源檢測資料匯入腳本 (直接從 CSV 匯入)")
    parser.add_argument("--csv", type=Path, required=True, help="CSV 原始檔案路徑")
    parser.add_argument("--batch-size", type=int, default=5000, help="批次寫入的大小")
    args = parser.parse_args()

    process(args.csv, args.batch_size)