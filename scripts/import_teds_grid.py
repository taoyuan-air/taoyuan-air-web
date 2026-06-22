#!/usr/bin/env python3
"""
TEDS 網格化排放量匯入腳本 (Grid-based Emissions)
處理流程：CSV → JSON 落地 → PostgreSQL 批次匯入
目標：全台網格背景排放，對應資料庫版本 TEDS12 (2021發布資料)
"""

import os
import json
import logging
import pandas as pd
import psycopg2
from pathlib import Path
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# 載入環境變數
load_dotenv()

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

# CSV 標題翻譯為資料庫 ID 
POLLUTANT_MAP = {
    "TSP": "TSP",
    "PM10": "PM10", 
    "PM2.5": "PM25",
    "SOx": "SOX", 
    "NOx": "NOX", 
    "THC": "THC",
    "NMHC": "NMHC", 
    "CO": "CO", 
    "Pb": "PB", 
    "NH3": "NH3"
}

# Logging 設定
logging.basicConfig(
    level=logging.INFO, 
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ===========================================================
# 3. 品質控管工具函式 
# ===========================================================

def clean_emission(val):
    """
    QC 控管邏輯：
    1. 轉換失敗或 NaN -> 0.0, 'invalid'
    2. 負值 (異常碼) -> 0.0, 'invalid'
    3. 正常數值 -> val, 'good'
    """
    try:
        # 處理 NaN 或 None
        if pd.isna(val):
            return 0.0, "invalid"
            
        f_val = float(val)
        
        # 處理負值 
        if f_val < 0:
            return 0.0, "invalid"
            
        return f_val, "good"
    except (ValueError, TypeError):
        return 0.0, "invalid"

# ===========================================================
# 4. CSV → JSON 轉換 
# ===========================================================

def csv_to_json(csv_path: Path, json_path: Path):
    log.info(f"▶ 讀取網格 CSV：{csv_path.name}")
    df = pd.read_csv(csv_path)
    records = []
    
    # 用於最後輸出統計
    stats = {"total": 0, "invalid_count": 0}

    for _, row in df.iterrows():
        stats["total"] += 1
        
        # 提取座標 
        try:
            point = {
                "lat": float(row["WGS84_N"]), 
                "lon": float(row["WGS84_E"])
            }
        except Exception:
            log.warning(f"  ⚠️ 第 {stats['total']} 行座標格式錯誤，已跳過")
            continue
        
        # 提取並清洗排放量數值
        emissions = {}
        for csv_col, db_id in POLLUTANT_MAP.items():
            # 呼叫 QC 清洗函式
            val, quality = clean_emission(row.get(csv_col))
            
            if quality == "invalid":
                stats["invalid_count"] += 1
                
            emissions[db_id] = {
                "value": val,
                "quality": quality # 儲存品質標記
            }
        
        records.append({
            "point": point,
            "emissions": emissions
        })

    # 輸出 QC 統計摘要
    log.info(f" 📊 QC 統計：總處理 {stats['total']} 筆，發現 {stats['invalid_count']} 項異常值並已校正。")

    # 將轉換後的資料存為 JSON 備份
    json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=4)
    log.info(f" 💾 JSON 暫存檔已落地：{json_path}")
    return records

# ===========================================================
# 5. 資料庫操作
# ===========================================================

def insert_grid_points(conn, records):
    """匯入網格中心座標點，並回傳座標與資料庫 ID 的對照表"""
    sql = "INSERT INTO teds_grid_points (latitude, longitude) VALUES %s ON CONFLICT DO NOTHING;"
    
    # 提取唯一座標點
    rows = list(set([(r["point"]["lat"], r["point"]["lon"]) for r in records]))
    
    with conn.cursor() as cur:
        execute_values(cur, sql, rows)
    conn.commit()
    
    # 同步取得資料庫分配的 grid_id
    with conn.cursor() as cur:
        cur.execute("SELECT grid_id, latitude, longitude FROM teds_grid_points;")
        return {(f"{row[1]:.7f}", f"{row[2]:.7f}"): row[0] for row in cur.fetchall()}

def insert_grid_emissions(conn, records, point_map, batch_size):
    """根據點位 ID 對照表，批次匯入排放量數據"""
    sql = """
        INSERT INTO teds_grid_emission_data (grid_id, observation_id, emission_value) 
        VALUES %s 
        ON CONFLICT (grid_id, observation_id) DO NOTHING;
    """
    all_rows = []
    for r in records:
        lat_key = f"{r['point']['lat']:.7f}"
        lon_key = f"{r['point']['lon']:.7f}"
        grid_id = point_map.get((lat_key, lon_key))

        if grid_id:
            for obs_id, data in r["emissions"].items():
                # 僅儲存有實際排放量 ( > 0 ) 的數據以優化空間
                val = data["value"]
                all_rows.append((grid_id, obs_id, val))
    
    with conn.cursor() as cur:
        for i in range(0, len(all_rows), batch_size):
            execute_values(cur, sql, all_rows[i:i+batch_size])
    conn.commit()
    return len(all_rows)

# ===========================================================
# 6. 主處理流程
# ===========================================================

def process(csv_path: Path, json_dir: Path, batch_size: int):
    """執行完整匯入流程：CSV->JSON->DB"""
    json_path = json_dir / f"grid_temp_{csv_path.stem}.json"
    records = csv_to_json(csv_path, json_path)
    
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        
        # 同步點位
        log.info("▶ 正在同步網格點位...")
        point_map = insert_grid_points(conn, records)
        
        # 批次匯入排放量
        log.info(f"▶ 正在批次匯入網格排放量 (Batch size: {batch_size})...")
        inserted = insert_grid_emissions(conn, records, point_map, batch_size)
        log.info(f"✅ 成功插入網格排放量記錄：{inserted} 筆")
        
        # 更新 PostGIS 空間幾何
        with conn.cursor() as cur:
            cur.execute("SELECT update_grid_geometries();")
        conn.commit()
        log.info("🌐 空間幾何欄位更新完成")
        
        conn.close()
    except Exception as e:
        log.error(f"❌ 匯入失敗：{e}")

# ===========================================================
# 7. 主程式入口
# ===========================================================

def main():
    import argparse
    parser = argparse.ArgumentParser(description="TEDS 網格化資料匯入工具")
    parser.add_argument("--csv", type=Path, default=Path("TEDS12.0_total_emission_WGS84.csv"))
    parser.add_argument("--json-dir", type=Path, default=Path("./data/raw/teds-stations/json/"))
    parser.add_argument("--batch-size", type=int, default=5000)
    args = parser.parse_args()

    process(args.csv, args.json_dir, args.batch_size)

if __name__ == "__main__":
    main()