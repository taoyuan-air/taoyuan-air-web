#!/usr/bin/env python3
"""
CWA 測站資料匯入腳本
自動讀取 cwa-stations-data 目錄下的 TXT 檔案，經轉檔與處理後匯入資料庫
"""

import os
import argparse
import json
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterator

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
INVALID_FLOAT_VALUES: set[float] = {-99.5, -999.0, -9999.0}
INVALID_STR_VALUES: set[str]     = {"-99.5", "-999", "-9999", "NONE", "X", "x", ""}

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
    if raw_str.upper() in {v.upper() for v in INVALID_STR_VALUES}:
        return (raw_str if raw_str else None, None, "invalid")
    try:
        numeric = float(raw_str)
        if numeric in INVALID_FLOAT_VALUES:
            return (raw_str, None, "invalid")
        return (raw_str, numeric, "good")
    except:
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
# TXT 解析
# ===========================================================

def _parse_txt_value(raw: str) -> Any:
    """
    將 TXT 單格原始字串轉為 Python 值（供 JSON 序列化）：
      - 無效字串 → None
      - 可轉數字 → float（無效數值也轉為 None）
      - 其他     → 原始字串
    """
    stripped = raw.strip()
    if stripped.upper() in {"NONE", "X", ""}:
        return None
    try:
        numeric = float(stripped)
        return None if numeric in INVALID_FLOAT_VALUES else numeric
    except ValueError:
        return stripped if stripped else None

def parse_txt_to_records(filepath: Path) -> list[dict]:
    records  = []
    headers  = []
    line_num = 0
    col_width = 9  # 預設格式

    # --- 自動獲取內容與編碼 ---
    content, used_encoding = read_file_with_auto_encoding(filepath)
    lines = content.splitlines()

    for line in lines:
        line_num += 1
        clean = line.rstrip("\n")

        # 1. 處理註解與自動偵測寬度
        if not clean.strip() or clean.startswith("*"):
            if "7個字元" in clean:
                col_width = 7
            elif "9個字元" in clean:
                col_width = 9
            continue

        # 2. 處理標題行
        if clean.startswith("#"):
            all_cols = clean.lstrip("#").strip().split()
            headers  = all_cols[2:]
            if "  " not in clean[17:26]: 
                col_width = 7
            continue

        if not headers or len(clean) < 17:
            continue
        
        # 3. 解析資料列
        stno = clean[0:6].strip()
        datetime_str = clean[7:17].strip()
        data_part = clean[17:]

        # 根據偵測到的 col_width 切割
        raw_values = [data_part[i:i+col_width] for i in range(0, len(data_part), col_width)]

        data_dict = {}
        for i, raw_val in enumerate(raw_values):
            if i < len(headers):
                data_dict[headers[i]] = _parse_txt_value(raw_val)

        if stno and datetime_str:
            records.append({
                "stno":     stno,
                "datetime": datetime_str,
                "data":     data_dict,
            })

    return records


def get_json_output_path(txt_path: Path, json_dir: Path | None) -> Path:
    """
    計算 TXT 對應的 JSON 輸出路徑。
      20260299.agr_hr.txt → 20260299.agr_hr.json
      20260201.txt        → 20260201.json
    """
    name = txt_path.name
    if name.endswith(".agr_hr.txt"):
        json_name = name[:-4] + ".json"        # 只換最後的 .txt → .json
    else:
        json_name = txt_path.stem + ".json"

    base = json_dir if json_dir else txt_path.parent
    return base / json_name


# ===========================================================
# JSON 讀取
# ===========================================================

def iter_json_records(filepath: Path) -> Iterator[dict]:
    """
    讀取 JSON 檔，逐筆 yield。
    支援整個檔案為 JSON array，或每行一筆 JSONL。
    """
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read().strip()

    if not content:
        return

    try:
        data = json.loads(content)
        if isinstance(data, list):
            yield from data
        elif isinstance(data, dict):
            yield data
        return
    except json.JSONDecodeError:
        pass

    # 降格逐行 JSONL
    for lineno, line in enumerate(content.splitlines(), 1):
        line = line.strip().rstrip(",")
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError as exc:
            log.warning("  [%s] 第 %d 行解析失敗：%s", filepath.name, lineno, exc)


# ===========================================================
# Unpivot：Wide → Long Format
# ===========================================================

def unpivot_record(record: dict) -> list[tuple]:
    """
    單筆記錄展開為多列（每個觀測項一列）。
    回傳：[(station_id, monitor_date, observation_id,
             concentration, concentration_numeric, data_quality), ...]
    """
    station_id = str(record.get("stno", "")).strip().upper()
    if not station_id or station_id not in TAOYUAN_STATION_IDS:
        return []

    monitor_date = parse_cwa_datetime(str(record.get("datetime", "")))
    if monitor_date is None:
        log.warning("  測站 %s 時間格式無法解析：%s", station_id, record.get("datetime"))
        return []

    obs_data = record.get("data", {})
    if not isinstance(obs_data, dict) or not obs_data:
        return []

    rows = []
    for obs_id, raw_val in obs_data.items():
        obs_id = str(obs_id).strip().upper()
        if not obs_id:
            continue
        conc_str, conc_num, quality = clean_value(raw_val)
        rows.append((station_id, monitor_date, obs_id, conc_str, conc_num, quality))

    return rows


# ===========================================================
# 資料庫插入
# ===========================================================

INSERT_SQL = """
INSERT INTO cwa_hourly_data
    (station_id, monitor_date, observation_id,
     concentration, concentration_numeric, data_quality)
VALUES %s
ON CONFLICT (station_id, monitor_date, observation_id) DO NOTHING;
"""


def batch_insert(conn, rows: list[tuple], batch_size: int) -> int:
    total = 0
    with conn.cursor() as cur:
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            execute_values(cur, INSERT_SQL, batch, page_size=batch_size)
            total += cur.rowcount if cur.rowcount > 0 else 0
    return total


# ===========================================================
# 單一檔案處理（TXT 或 JSON）
# ===========================================================

def process_file(conn, filepath: Path, batch_size: int, json_dir: Path | None) -> dict:
    """
    處理單一 TXT 或 JSON 檔：
      - TXT：解析 → 另存 JSON → 寫入 DB
      - JSON：直接讀取 → 寫入 DB
    """
    log.info("▶ 處理：%s", filepath.name)
    stats = {"raw": 0, "inserted": 0, "skipped": 0, "invalid": 0}

    is_txt = filepath.suffix.lower() == ".txt" or filepath.name.endswith(".agr_hr.txt")

    # ── TXT：解析並另存 JSON ──────────────────────────────
    if is_txt:
        try:
            records = parse_txt_to_records(filepath)
        except Exception as exc:
            log.error("  ❌ TXT 讀取失敗：%s", exc)
            return stats

        if not records:
            log.warning("  ⚠️  TXT 未產生任何資料，請確認是否含有 '#' 標題列。")
            return stats

        # 另存 JSON 落地
        json_path = get_json_output_path(filepath, json_dir)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(records, f, ensure_ascii=False, indent=2)
            log.info("  💾 JSON 已儲存：%s（%d 筆）", json_path, len(records))
        except Exception as exc:
            log.error("  ❌ JSON 儲存失敗：%s", exc)
            return stats

        source_records: Iterator[dict] = iter(records)

    # ── JSON：直接讀取 ────────────────────────────────────
    else:
        source_records = iter_json_records(filepath)

    # ── 共用：Unpivot → 批次寫入 DB ──────────────────────
    all_rows: list[tuple] = []
    for record in source_records:
        stats["raw"] += 1
        rows = unpivot_record(record)
        if not rows:
            stats["skipped"] += 1
            continue
        stats["invalid"] += sum(1 for r in rows if r[5] == "invalid")
        all_rows.extend(rows)

    if not all_rows:
        log.info("  ⚠️  無符合桃園測站的資料，略過。")
        return stats

    try:
        inserted = batch_insert(conn, all_rows, batch_size)
        conn.commit()
        stats["inserted"] = inserted
        log.info(
            "  ✅ 原始 %d 筆 → 展開 %d 列 → 新增 %d 列（invalid %d 個）",
            stats["raw"], len(all_rows), inserted, stats["invalid"],
        )
    except Exception as exc:
        conn.rollback()
        log.exception("  ❌ 插入失敗：%s", exc)

    return stats


# ===========================================================
# 主流程
# ===========================================================

def collect_files(path: Path, recursive: bool) -> list[Path]:
    """收集目錄下所有 TXT 與 JSON 檔案。"""
    if path.is_file():
        return [path]
    base = "**/*" if recursive else "*"
    files = []
    for ext in ("*.txt", "*.json"):
        pattern = f"**/{ext}" if recursive else ext
        files.extend(path.glob(pattern))
    return sorted(set(files))


def main():
    parser = argparse.ArgumentParser(
        description="匯入 CWA 氣象資料（TXT 或 JSON）到 PostgreSQL",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--file", type=Path, help="單一 TXT 或 JSON 檔路徑")
    group.add_argument("--dir",  type=Path, help="資料目錄（自動搜尋 TXT 與 JSON）")

    parser.add_argument(
        "--recursive", action="store_true",
        help="遞迴搜尋子目錄",
    )
    parser.add_argument(
        "--json-dir", type=Path, default=None,
        help="TXT 轉換後的 JSON 儲存目錄（預設：與 TXT 同目錄）",
    )
    parser.add_argument(
        "--batch-size", type=int, default=5000,
        help="批次插入大小（預設 5000）",
    )
    args = parser.parse_args()

    # 收集檔案
    files = [args.file] if args.file else collect_files(args.dir, args.recursive)
    if not files:
        log.error("找不到任何 TXT 或 JSON 檔，請確認路徑。")
        sys.exit(1)

    txt_count  = sum(1 for f in files if f.suffix.lower() == ".txt")
    json_count = len(files) - txt_count
    log.info("共找到 %d 個檔案（TXT: %d，JSON: %d），開始處理…",
             len(files), txt_count, json_count)

    # 資料庫連線
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = False
    except psycopg2.OperationalError as exc:
        log.error("無法連線資料庫：%s", exc)
        sys.exit(1)

    # 逐檔處理
    total = {"raw": 0, "inserted": 0, "skipped": 0, "invalid": 0}
    for filepath in files:
        if not filepath.exists():
            log.warning("  檔案不存在，略過：%s", filepath)
            continue
        s = process_file(conn, filepath, args.batch_size, args.json_dir)
        for k in total:
            total[k] += s.get(k, 0)

    conn.close()
    log.info(
        "🏁 全部完成！原始 %d 筆，展開後新增 %d 列，略過 %d 筆（非桃園），invalid %d 個。",
        total["raw"], total["inserted"], total["skipped"], total["invalid"],
    )

if __name__ == "__main__":
    main()