#!/usr/bin/env python3
"""
MOE 測站資料匯入腳本
自動讀取 moe-stations-data 目錄下的 JSON 檔案並匯入資料庫
"""

import os
import json
import psycopg2
from psycopg2.extras import execute_batch
from pathlib import Path
from datetime import datetime, timedelta
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

# 資料庫連線設定
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': os.getenv('POSTGRES_PORT', '5432'),
    'database': os.getenv('POSTGRES_DB', 'taoyuan_air'),
    'user': os.getenv('POSTGRES_USER', 'taoyuan_user'),
    'password': os.getenv('POSTGRES_PASSWORD')  # 不提供預設值，強制使用環境變數
}

# 測站 ID 對應
STATION_MAPPING = {
    'AQX_P_205': '17',  # 桃園
    'AQX_P_206': '18',  # 大園
    'AQX_P_207': '19',  # 觀音
    'AQX_P_208': '20',  # 平鎮
    'AQX_P_209': '21',  # 龍潭
    'AQX_P_255': '68',  # 中壢
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


def ensure_moe_hourly_schema(conn):
    """補齊 moe_hourly_data 的 V2 欄位，避免舊資料庫結構造成匯入失敗。"""
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            ALTER TABLE IF EXISTS public.moe_hourly_data
            ADD COLUMN IF NOT EXISTS period_start TIMESTAMP,
            ADD COLUMN IF NOT EXISTS period_end TIMESTAMP,
            ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'history';
            """
        )
        cursor.execute(
            """
            UPDATE public.moe_hourly_data
            SET source = 'history'
            WHERE source IS NULL;
            """
        )
        conn.commit()
        print("[OK] 已確認 moe_hourly_data 欄位相容（period_start/period_end/source）")
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] 資料表結構修復失敗: {e}")
        raise
    finally:
        if cursor:
            cursor.close()

def parse_concentration(value):
    """解析濃度值，處理 'x' 等無效值"""
    if value is None or value == '' or value == 'x':
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def parse_monitor_date(value):
    """將 MOE 時間字串轉為 datetime，支援有/無秒格式。"""
    if not value:
        return None
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M'):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
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
        skipped_count = 0
        
        for record in data:
            concentration = record.get('concentration')
            concentration_numeric = parse_concentration(concentration)
            monitor_date = parse_monitor_date(record.get('monitordate'))

            if monitor_date is None:
                skipped_count += 1
                continue
            
            # 判斷資料品質
            if concentration_numeric is None:
                invalid_count += 1
                data_quality = 'invalid'
            else:
                data_quality = 'good'
            
            insert_data.append((
                station_id,
                monitor_date,
                record.get('itemid'),
                record.get('itemname'),
                record.get('itemengname'),
                record.get('itemunit'),
                concentration,
                concentration_numeric,
                data_quality,
                monitor_date,
                monitor_date + timedelta(minutes=59),
                'history'
            ))
        
        if invalid_count > 0:
            print(f"    [WARNING] 發現 {invalid_count} 筆濃度無效資料（將標記為 invalid）")
        if skipped_count > 0:
            print(f"    [WARNING] 發現 {skipped_count} 筆時間格式錯誤資料（已跳過）")
        
        # 批次插入
        cursor = None
        try:
            cursor = conn.cursor()
            insert_query = """
                INSERT INTO moe_hourly_data 
                (station_id, monitor_date, pollutant_id, pollutant_name, 
                 pollutant_eng_name, unit, concentration, concentration_numeric, data_quality,
                 period_start, period_end, source)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (station_id, monitor_date, pollutant_id)
                DO UPDATE SET
                    concentration = EXCLUDED.concentration,
                    concentration_numeric = EXCLUDED.concentration_numeric,
                    data_quality = EXCLUDED.data_quality,
                    period_start = EXCLUDED.period_start,
                    period_end = EXCLUDED.period_end,
                    source = EXCLUDED.source
                WHERE moe_hourly_data.source = 'realtime'
            """
            
            print(f"    開始批次匯入...")
            execute_batch(cursor, insert_query, insert_data, page_size=1000)
            conn.commit()
            
            valid_count = len(insert_data) - invalid_count
            print(
                f"    [OK] 成功匯入 {len(insert_data)} 筆資料 "
                f"(有效: {valid_count}, 無效: {invalid_count}, 跳過: {skipped_count})"
            )
            return len(insert_data)
            
        except Exception as db_error:
            print(f"    [ERROR] 資料庫操作失敗: {db_error}")
            conn.rollback()
            raise  # 重新拋出異常讓外層處理
        finally:
            # 確保游標在成功或失敗時都會被關閉
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    # 若游標尚未建立或已關閉，忽略錯誤
                    pass
        
    except Exception as e:
        print(f"  [ERROR] 匯入失敗: {e}")
        conn.rollback()
        return 0

def main():
    """主程式"""
    print("=" * 60)
    print("MOE 測站資料匯入工具")
    print("=" * 60)
    
    # 連接資料庫
    conn = connect_db()
    if not conn:
        return

    # 先補齊舊資料庫缺漏欄位，避免批次匯入時出現 column does not exist
    ensure_moe_hourly_schema(conn)
    
    # 取得專案根目錄
    project_root = Path(__file__).parent.parent
    data_dir = project_root / 'data' / 'raw' / 'moe-stations'
    
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
