#!/usr/bin/env python3
"""
CWA 測站資料匯入腳本
自動讀取 cwa-stations-data 目錄下的 TXT 檔案，經轉檔與處理後匯入資料庫
"""

import os
import argparse
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

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
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": os.getenv("POSTGRES_PORT", "5433"),
    "dbname": os.getenv("POSTGRES_DB", "cwa_weather"),
    "user": os.getenv("POSTGRES_USER", "cwa_user"),
    "password": os.getenv('POSTGRES_PASSWORD')  # 不提供預設值，強制使用環境變數
}

# ===========================================================
# 2. 桃園市測站 ID 對應
# ===========================================================
TAOYUAN_STATION_IDS = {
    # 中央氣象署有人站
    "467050",
    # 自動氣象站 
    "C1C510",   "C0C800",   "C0C790",   "C0C750",
    "C0C740",   "C0C730",   "C0C720",   "C0C710",
    "C0C700",   "C0C680",   "C0C670",   "C0C660",
    "C0C650",   "C0C630",   "C0C620",   "C0C490",
    "C0C460", 
    # 農業氣象站 
    "72C440",   "82C160",   "A2C560",   "C2C410",
    "C2C590", 
    # 依實際需求繼續補充 ...
}
REQUIRED_OBS_IDS = {"PP01", "PS01", "RH01", "TX01", "WD01", "WD02"}

# 無效值定義
INVALID_FLOAT_VALUES = {
    -999.1, -9991, # 儀器故障待修
    -9.6, -999.6, -9996, # 資料累計於後
    -9.5, -99.5, -999.5, -9995, -9999.5, # 故障
    -9.7, -99.7, -999.7, -9997, -9999.7, # 不明原因
    -9999 # 未觀測
    # -9.8, -9998 # 雨跡 (Trace)
}
INVALID_STR_VALUES = {"NONE", "X", "x", "", "NULL"}

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ===========================================================
# 3. 工具函式 (時間、清洗、編碼)
# ===========================================================

def parse_cwa_datetime(dt_str: str) -> datetime | None:
    """解析時間並修正 24:00 為隔日 00:00"""
    dt_str = str(dt_str).strip()
    try:
        is_24h = False
        if len(dt_str) >= 10 and dt_str[8:10] == "24":
            dt_str = dt_str[:8] + "00" + dt_str[10:]
            is_24h = True
        
        fmt = "%Y%m%d%H" if len(dt_str) == 10 else "%Y%m%d%H%M"
        dt = datetime.strptime(dt_str, fmt)
        if is_24h:
            dt += timedelta(days=1)
        return dt
    except:
        return None

def clean_value(raw: Any) -> tuple[str | None, float | None, str]:
    """清洗觀測值並判斷資料品質"""
    if raw is None:
        return (None, None, "invalid")
    raw_str = str(raw).strip()
    raw_upper = raw_str.upper()

    if raw_upper in INVALID_STR_VALUES:
        return (raw_str if raw_str else None, None, "invalid")
    try:
        numeric = float(raw_str)
        # 處理雨跡 (Trace)，目前先存為 0.0，並標記品質為 'trace'
        if numeric in [-9.8, -9998.0]:
            return (raw_str, 0.0, "trace")
        # 處理其他無效數值代碼
        if numeric in INVALID_FLOAT_VALUES:
            return (raw_str, None, "invalid")
        
        return (raw_str, numeric, "good")
    except(ValueError, TypeError):
        return (raw_str, None, "invalid")

def read_file_with_auto_encoding(filepath: Path) -> tuple[str, str]:
    """自動偵測編碼 (UTF-8 / CP950)"""
    for enc in ["utf-8", "cp950"]:
        try:
            with open(filepath, "r", encoding=enc) as f:
                return f.read(), enc
        except UnicodeDecodeError:
            continue
    log.warning(f"無法辨識檔案編碼: {filepath.name}，使用 errors='replace'")
    return filepath.read_text(encoding="utf-8", errors="replace"), "utf-8"
    
# ===========================================================
# 4. 核心解析邏輯
# ===========================================================

def parse_txt_to_records(filepath: Path) -> list[dict]:
    content, used_enc = read_file_with_auto_encoding(filepath)
    lines = content.splitlines()
    
    records = []
    headers = []

    for line in lines:
        # 1. 基礎過濾：跳過空白行與純註解行
        clean = line.strip()
        if not clean or clean.startswith("*"):
            continue
        
        # 2. 處理表頭列：擷取欄位名稱
        if clean.startswith("#"):
            parts = clean.lstrip("#").strip().split()
            if len(parts) > 2:
                headers = parts[2:]  # 跳過站號與時間欄位
            continue
        
        # 3. 資料列檢查：確保已經有表頭且長度足以包含站號與時間 (前 17 字元)
        if not headers or len(line) < 17:
            continue

        # 4. 解析固定前綴：站號 (0-6) 與 時間 (7-17)
        stno = line[0:6].strip()
        datetime_str = line[7:17].strip()
        
        # 5. 動態計算資料欄位寬度
        data_part = line[17:]
        num_cols = len(headers)
        
        if num_cols > 0:
            # 自動偵測寬度：剩餘長度 // 欄位數量
            col_width = len(data_part) // num_cols
            
            # 安全機制：如果長度不夠整除，預設回 9
            if col_width < 1:
                col_width = 9
        else:
            col_width = 9

        # 6. 按計算出的寬度切割字串
        raw_values = [
            data_part[i : i + col_width].strip() 
            for i in range(0, len(data_part), col_width)
        ]
        
        # 7. 封裝成字典：zip 會自動配對 headers 與 raw_values
        data_dict = dict(zip(headers, raw_values))
        
        records.append({
            "stno": stno, 
            "datetime": datetime_str, 
            "data": data_dict
        })
        
    return records

def unpivot_record(record: dict) -> list[tuple]:
    """將 Wide Format 轉為資料庫所需的 Long Format，並過濾掉不需要的觀測項"""
    station_id = str(record.get("stno", "")).strip().upper()
    if station_id not in TAOYUAN_STATION_IDS: return []

    raw_dt = parse_cwa_datetime(record.get("datetime", ""))
    if not raw_dt: return []

    rows = []
    obs_data = record.get("data", {})

    for obs_id, raw_val in obs_data.items():
        obs_id_upper = obs_id.strip().upper()
        if obs_id_upper not in REQUIRED_OBS_IDS:
            continue
        conc_str, conc_num, quality = clean_value(raw_val)

        # 1. 降水量 PP01：時間往前推 1 小時，區間為該小時初到 59 分
        if obs_id_upper == 'PP01':
            monitor_date = raw_dt - timedelta(hours=1)
            p_start = monitor_date
            p_end = monitor_date + timedelta(minutes=59)

        # 2. 平均風 WD01, WD02：區間為前 10 分鐘到前 1 分鐘
        elif obs_id_upper in ['WD01', 'WD02']:
            monitor_date = raw_dt
            p_start = raw_dt - timedelta(minutes=10)
            p_end = raw_dt - timedelta(minutes=1)

        # 3. 瞬時值 TX01, RH01, PS01：區間為前 1 分鐘到該時刻
        elif obs_id_upper in ['TX01', 'RH01', 'PS01']:
            monitor_date = raw_dt
            p_start = raw_dt - timedelta(minutes=1)
            p_end = raw_dt
        
        source = "history"

        rows.append((station_id, monitor_date, obs_id_upper, conc_str, conc_num, quality, p_start, p_end, source))
    return rows

# ===========================================================
# 5. 資料庫操作
# ===========================================================

def batch_insert(conn, rows: list[tuple], batch_size: int) -> int:
    sql = """
        INSERT INTO cwa_hourly_data 
        (station_id, monitor_date, observation_id, concentration, concentration_numeric, data_quality, period_start, period_end, source)
        VALUES %s
        ON CONFLICT (station_id, monitor_date, observation_id) DO NOTHING;
    """
    total_inserted = 0
    with conn.cursor() as cur:
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            execute_values(cur, sql, batch, page_size=batch_size)
            total_inserted += cur.rowcount if cur.rowcount > 0 else 0
    return total_inserted

def process_file(conn, filepath: Path, batch_size: int, json_dir: Path | None) -> dict:
    log.info(f"▶ 處理檔案: {filepath.name}")
    stats = {"raw": 0, "inserted": 0, "skipped": 0}

    is_txt = filepath.suffix.lower() == ".txt"
    if is_txt:
        records = parse_txt_to_records(filepath)
        if json_dir:
            json_path = json_dir / (filepath.stem + ".json")
            json_dir.mkdir(parents=True, exist_ok=True)
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(records, f, ensure_ascii=False, indent=2)
            log.info(f"  💾 JSON 已落地: {json_path.name}")
        source_records = iter(records)
    else:
        with open(filepath, "r", encoding="utf-8") as f:
            source_records = iter(json.load(f))

    all_rows = []
    for record in source_records:
        stats["raw"] += 1
        rows = unpivot_record(record)
        if not rows:
            stats["skipped"] += 1
            continue
        all_rows.extend(rows)

    if all_rows:
        try:
            stats["inserted"] = batch_insert(conn, all_rows, batch_size)
            conn.commit()
            log.info(f"  ✅ 成功插入 {stats['inserted']} 列資料")
        except Exception as e:
            conn.rollback()
            log.error(f"  ❌ 插入失敗: {e}")
    
    return stats


# ===========================================================
# 主程式
# ===========================================================

def main():
    parser = argparse.ArgumentParser(description="CWA Data Importer")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--file", type=Path, help="單一檔案路徑")
    group.add_argument("--dir",  type=Path, help="整個目錄進行批次匯入")
    parser.add_argument("--json-dir", type=Path, help="JSON 落地目錄")
    parser.add_argument("--batch-size", type=int, default=5000)
    args = parser.parse_args()

    # --- 批次檔案收集邏輯 ---
    if args.file:
        files = [args.file]
        base_dir = args.file.parent
    else:
        # 遞迴尋找所有 .txt，並排除隱藏檔
        base_dir = args.dir
        files = sorted(list(base_dir.rglob("*.txt")))
        log.info(f"📂 批次模式：在 {base_dir} 找到 {len(files)} 個原始 TXT 檔案")

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        total_stats = {"files": 0, "rows": 0}
        
        for f in files:
            if not f.is_file(): continue
            relative_path = f.relative_to(base_dir)
            current_json_output_dir = None
            if args.json_dir:
                current_json_output_dir = args.json_dir / relative_path.parent

            # 執行處理
            res = process_file(conn, f, args.batch_size, current_json_output_dir)
            
            total_stats["files"] += 1
            total_stats["rows"] += res.get("inserted", 0)
            
        log.info(f"🏁 批次匯入完成！成功處理 {total_stats['files']} 個檔案，共新增 {total_stats['rows']} 列資料。")
        conn.close()
        
    except Exception as e:
        log.error(f"💥 批次執行中斷: {e}")

if __name__ == "__main__":
    main()