#!/usr/bin/env python3
"""
EPA 測站資料匯入腳本
自動讀取 epa-stations-data 目錄下的 JSON 檔案並匯入資料庫
"""

import os
import json
import psycopg2
from psycopg2.extras import execute_batch
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# 載入環境變數
load_dotenv()

# 資料庫連線設定
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': os.getenv('POSTGRES_PORT', '5432'),
    'database': os.getenv('POSTGRES_DB', 'taoyuan_air'),
    'user': os.getenv('POSTGRES_USER', 'taoyuan_user'),
    'password': os.getenv('POSTGRES_PASSWORD', 'your_password')
}

# 測站 ID 對應（目前只有 5 個測站）
STATION_MAPPING = {
    'AQX_P_205': '17',  # 桃園
    'AQX_P_206': '18',  # 大園
    'AQX_P_207': '19',  # 觀音
    'AQX_P_208': '20',  # 平鎮
    'AQX_P_209': '21',  # 龍潭
    # 'AQX_P_210': '22',  # 中壢（尚未取得資料）
}

def connect_db():
    """連接資料庫"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print("[OK] 資料庫連線成功")
        return conn
    except Exception as e:
        print(f"[ERROR] 資料庫連線失敗: {e}")
        return None

def parse_concentration(value):
    """解析濃度值，處理 'x' 等無效值"""
    if value is None or value == '' or value == 'x':
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None

def import_json_file(conn, file_path, station_id):
    """匯入單一 JSON 檔案"""
    try:
        print(f"    讀取檔案: {file_path.name}")
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if not data:
            print(f"    [WARNING] 檔案為空")
            return 0
        
        print(f"    找到 {len(data)} 筆原始資料")
        
        # 準備批次插入資料
        insert_data = []
        invalid_count = 0
        
        for record in data:
            concentration = record.get('concentration')
            concentration_numeric = parse_concentration(concentration)
            
            # 判斷資料品質
            if concentration_numeric is None:
                invalid_count += 1
                data_quality = 'invalid'
            else:
                data_quality = 'good'
            
            insert_data.append((
                station_id,
                record.get('monitordate'),
                record.get('itemid'),
                record.get('itemname'),
                record.get('itemengname'),
                record.get('itemunit'),
                concentration,
                concentration_numeric,
                data_quality
            ))
        
        if invalid_count > 0:
            print(f"    [WARNING] 發現 {invalid_count} 筆無效資料（將標記為 invalid）")
        
        # 批次插入
        cursor = conn.cursor()
        insert_query = """
            INSERT INTO epa_hourly_data 
            (station_id, monitor_date, pollutant_id, pollutant_name, 
             pollutant_eng_name, unit, concentration, concentration_numeric, data_quality)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
        """
        
        print(f"    開始批次匯入...")
        execute_batch(cursor, insert_query, insert_data, page_size=1000)
        conn.commit()
        cursor.close()
        
        valid_count = len(insert_data) - invalid_count
        print(f"    [OK] 成功匯入 {len(insert_data)} 筆資料 (有效: {valid_count}, 無效: {invalid_count})")
        return len(insert_data)
        
    except Exception as e:
        print(f"  [ERROR] 匯入失敗: {e}")
        conn.rollback()
        return 0

def main():
    """主程式"""
    print("=" * 60)
    print("EPA 測站資料匯入工具")
    print("=" * 60)
    
    # 連接資料庫
    conn = connect_db()
    if not conn:
        return
    
    # 取得專案根目錄
    project_root = Path(__file__).parent.parent
    data_dir = project_root / 'data' / 'raw' / 'epa-stations'
    
    if not data_dir.exists():
        print(f"[ERROR] 資料目錄不存在: {data_dir}")
        return
    
    print(f"\n資料目錄: {data_dir}")
    print("-" * 60)
    
    total_records = 0
    total_files = 0
    
    # 遍歷所有測站資料夾
    for folder_name, station_id in STATION_MAPPING.items():
        folder_path = data_dir / f"{folder_name}_Resource"
        
        if not folder_path.exists():
            print(f"\n[WARNING] 測站資料夾不存在: {folder_name}")
            continue
        
        print(f"\n[INFO] 處理測站: {folder_name} (ID: {station_id})")
        print("-" * 60)
        
        # 尋找所有 JSON 檔案（排除 hash.txt）
        json_files = [f for f in folder_path.glob('*.json') if f.name != 'hash.txt']
        
        if not json_files:
            print("  [WARNING] 找不到 JSON 檔案")
            continue
        
        print(f"  找到 {len(json_files)} 個 JSON 檔案")
        
        for idx, json_file in enumerate(json_files, 1):
            print(f"\n  [{idx}/{len(json_files)}] 處理: {json_file.name}")
            records = import_json_file(conn, json_file, station_id)
            total_records += records
            total_files += 1
    
    # 關閉連線
    conn.close()
    
    # 顯示統計
    print("\n" + "=" * 60)
    print("匯入完成")
    print("=" * 60)
    print(f"總檔案數: {total_files}")
    print(f"總資料筆數: {total_records:,}")
    print("=" * 60)

if __name__ == '__main__':
    main()
