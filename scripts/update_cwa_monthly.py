#!/usr/bin/env python3
import json
import psycopg2
from pathlib import Path
from import_cwa_stations import (
    DB_CONFIG, parse_txt_to_records, unpivot_record, log
)

# 定義目標資料夾
PACKAGE_DIRS = ["Package_24780", "Package_24781", "Package_24937"]
BASE_PATH = Path("./data/raw/cwa-stations")
JSON_PATH = BASE_PATH / "json"

def get_latest_files():
    """根據檔名排序，自動偵測三個資料夾中最新的檔案"""
    latest_files = []
    for pkg in PACKAGE_DIRS:
        pkg_path = BASE_PATH / pkg
        if not pkg_path.exists():
            log.warning(f"找不到路徑: {pkg_path}")
            continue
        
        # 獲取所有檔案並按檔名排序
        all_files = sorted([f for f in pkg_path.iterdir() if f.is_file()])
        if not all_files:
            continue
            
        latest = all_files[-1] # 取檔名排序最後一個
        latest_files.append(latest)
    return latest_files

def run_staging_and_upsert(conn, all_rows):
    """寫入暫存並 UPSERT"""
    from psycopg2.extras import execute_values
    
    with conn.cursor() as cur:
        # Step 2: 建立並清空暫存表
        log.info("--- 階段 2: 正在建立資料庫暫存表... ---")
        cur.execute("CREATE TEMP TABLE IF NOT EXISTS cwa_hourly_data_staging (LIKE cwa_hourly_data INCLUDING ALL)")
        cur.execute("TRUNCATE cwa_hourly_data_staging")
        
        # 寫入暫存表
        sql_insert = """
            INSERT INTO cwa_hourly_data_staging 
            (station_id, monitor_date, observation_id, concentration, concentration_numeric, data_quality, period_start, period_end, source)
            VALUES %s
        """
        execute_values(cur, sql_insert, all_rows)
        log.info(f"已寫入暫存表 ({len(all_rows)} 筆)")

        # Step 3: 精確覆蓋正式表
        log.info("--- 階段 3: 正在執行 UPSERT... ---")
        sql_upsert = """
            INSERT INTO cwa_hourly_data 
            SELECT * FROM cwa_hourly_data_staging
            ON CONFLICT (station_id, monitor_date, observation_id) 
            DO UPDATE SET 
                concentration = EXCLUDED.concentration,
                concentration_numeric = EXCLUDED.concentration_numeric,
                data_quality = EXCLUDED.data_quality,
                source = 'history',
                created_at = NOW()
            WHERE cwa_hourly_data.source = 'realtime';
        """
        cur.execute(sql_upsert)
        affected = cur.rowcount
        log.info(f"覆蓋完成！成功更新 {affected} 筆即時資料為歷史資料")

def main():
    try:
        JSON_PATH.mkdir(parents=True, exist_ok=True)
        files = get_latest_files()
        if not files:
            log.error("在指定資料夾中找不到任何檔案")
            return

        log.info(f"偵測到最新檔案 (共 {len(files)} 個): {[f.name for f in files]}")
        
        all_rows = []
        for f in files:
            log.info(f"▶ 處理檔案: {f.name}")

            records = parse_txt_to_records(f)

            json_file = JSON_PATH / (f.stem + ".json")
            with open(json_file, "w", encoding="utf-8") as jf:
                json.dump(records, jf, ensure_ascii=False, indent=2)
            log.info(f"   💾 JSON 已落地: {json_file.name}")

            for rec in records:
                all_rows.extend(unpivot_record(rec))
        
        if all_rows:
            conn = psycopg2.connect(**DB_CONFIG)
            run_staging_and_upsert(conn, all_rows)
            conn.commit()
            conn.close()
            log.info("🏁 每月歷史更新作業順利結束")
            
    except Exception as e:
        log.error(f"💥 處理失敗: {e}")

if __name__ == "__main__":
    main()