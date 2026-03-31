#!/usr/bin/env python3
"""
import_cwa_json.py
==================
將中央氣象署逐時資料（TXT 或 JSON）匯入 PostgreSQL 氣象資料庫。

本腳本自動判斷副檔名：
  - 輸入 TXT → 解析為記錄結構 → 另存 JSON 檔落地 → 寫入資料庫
  - 輸入 JSON → 直接讀取 → 寫入資料庫

【TXT 檔格式】
  氣象署固定寬度文字檔：
    col 0-5   : 測站代碼（stno）
    col 7-16  : 觀測時間（datetime，YYYYMMDDHH）
    col 17+   : 觀測值，每 9 個字元一欄
  以 '*' 開頭為註解行（略過），以 '#' 開頭為欄位標題行。

【JSON 檔格式】
  標準 JSON array 或每行一筆的 JSONL，結構如下：
  {"stno": "12J990", "datetime": "2026020101", "data": {"TX01": 15.3, "PP01": 0.0}}

【主要功能】
  - 自動判斷 TXT / JSON 並選擇對應解析邏輯
  - TXT 轉換後的 JSON 自動儲存至 --json-dir 指定目錄（預設與 TXT 同目錄）
  - 桃園市測站白名單過濾
  - Wide → Long Format 轉置（Unpivot）
  - 無效值清洗（None / -99.5 / -999 → NULL, data_quality='invalid'）
  - ON CONFLICT DO NOTHING（支援安全重複匯入）
  - execute_values 批次插入（高效能）

【使用方式】
    # 匯入單一 TXT 檔（自動另存 JSON 至同目錄）
    python import_cwa_json.py --file data/20260299.agr_hr.txt

    # 匯入單一 TXT 檔，JSON 另存至指定目錄
    python import_cwa_json.py --file data/20260299.agr_hr.txt --json-dir data/json/

    # 匯入單一 JSON 檔
    python import_cwa_json.py --file data/json/20260299.agr_hr.json

    # 批次匯入整個目錄（TXT + JSON 混合皆可）
    python import_cwa_json.py --dir data/

    # 批次匯入並遞迴搜尋子目錄，TXT 的 JSON 另存至指定目錄
    python import_cwa_json.py --dir data/txt/ --recursive --json-dir data/json/
"""

import argparse
import json
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterator

import psycopg2
from psycopg2.extras import execute_values

# ===========================================================
# 資料庫連線設定(測試用臨時建置之資料庫)
# ===========================================================
DB_CONFIG = {
    "host":     "localhost",
    "port":     5433,
    "dbname":   "cwa_weather",
    "user":     "cwa_user",
    "password": "cwa_pass_2024",
}

# ===========================================================
# 桃園市測站 ID 白名單
# ===========================================================
TAOYUAN_STATION_IDS: set[str] = {
    # 中央氣象署有人站
    "467050",   # 桃園
    # 自動氣象站 
    "C1C510",   "C0C800",   "C0C790",   "C0C750",
    "C0C740",   "C0C730",   "C0C720",   "C0C710",
    "C0C700",   "C0C680",   "C0C670",   "C0C660",
    "C0C650",   "C0C630",   "C0C620",   "C0C490",
    "C0C646", 
    # 農業氣象站 
    "72C440",   "82C160",   "A2C560",   "C2C410",
    "C2C590", 
    # 依實際需求繼續補充 ...
}

# ===========================================================
# 無效值定義
# ===========================================================
INVALID_FLOAT_VALUES: set[float] = {-99.5, -999.0, -9999.0}
INVALID_STR_VALUES: set[str]     = {"-99.5", "-999", "-9999", "NONE", "X", "x", ""}

# ===========================================================
# Logging
# ===========================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


# ===========================================================
# 共用工具
# ===========================================================

def parse_cwa_datetime(dt_str: str) -> datetime | None:
    """
    解析氣象署時間字串（YYYYMMDDHH 或 YYYYMMDDHHmm），
    回傳不含時區的 datetime，對應 schema 的 TIMESTAMP 欄位。
    """
    dt_str = str(dt_str).strip()
    try:
        # 處理 24 小時制問題 (e.g., 2019030124 -> 2019030200)
        is_24h = False
        if len(dt_str) >= 10 and dt_str[8:10] == "24":
            dt_str = dt_str[:8] + "00" + dt_str[10:]
            is_24h = True

        dt = None
        if len(dt_str) == 10:
            dt = datetime.strptime(dt_str, "%Y%m%d%H")
        elif len(dt_str) == 12:
            dt = datetime.strptime(dt_str, "%Y%m%d%H%M")
        
        if dt and is_24h:
            dt += timedelta(days=1)
        return dt
    except (ValueError, TypeError):
        return None


def clean_value(raw: Any) -> tuple[str | None, float | None, str]:
    """
    清洗單一觀測值，回傳 (concentration, concentration_numeric, data_quality)。
      - 正常值  → ('15.3', 15.3, 'good')
      - 無效值  → ('None', None, 'invalid') 或 ('-99.5', None, 'invalid')
    """
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
    except (ValueError, TypeError):
        return (raw_str, None, "invalid")


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

def read_file_with_auto_encoding(filepath: Path) -> str:
    """嘗試用不同編碼讀取檔案內容，失敗則切換"""
    encodings = ["utf-8", "cp950"] 
    
    for enc in encodings:
        try:
            with open(filepath, "r", encoding=enc) as f:
                return f.read(), enc
        except UnicodeDecodeError:
            continue
            
    # 如果都失敗，使用 errors='replace' 強制讀取並記錄警告
    log.error(f"無法辨識檔案編碼: {filepath.name}，將強制以 utf-8 替換錯誤字元讀取")
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        return f.read(), "utf-8"

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