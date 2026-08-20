#!/usr/bin/env python3
"""
MPL 氣膠光達資料匯入腳本
讀取 data/raw/MPL/json/ 下的 JSON 檔案（由 convert_MPL_nc.py 產生）並匯入資料庫。

使用方式:
    # 匯入單一 JSON 檔
    python import_mpl.py --file data/raw/MPL/json/MMPL_L1_NRB_20260810_mmpl5009_Guanyin_V1.json

    # 批次匯入整個目錄
    python import_mpl.py --dir data/raw/MPL/json

    # 指定 source（預設 realtime，月末校正版用 history）
    python import_mpl.py --dir data/raw/MPL/json --source history
"""

import argparse
import json
import logging
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import psycopg2
from psycopg2 import sql
from psycopg2.extras import execute_batch
from dotenv import load_dotenv

# 載入環境變數
load_dotenv()

# 檢查必要的環境變數
required_env_vars = ["POSTGRES_PASSWORD"]
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
    "host":     os.getenv("POSTGRES_HOST", "localhost"),
    "port":     os.getenv("POSTGRES_PORT", "5432"),
    "dbname":   os.getenv("POSTGRES_DB", "taoyuan_air"),
    "user":     os.getenv("POSTGRES_USER", "taoyuan_user"),
    "password": os.getenv("POSTGRES_PASSWORD"),
}

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ===========================================================
# 2. 工具函式
# ===========================================================

def connect_db() -> psycopg2.extensions.connection:
    """連接資料庫，失敗則直接結束程式。"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        log.info("[OK] 資料庫連線成功")
        return conn
    except Exception as e:
        log.error(f"[ERROR] 資料庫連線失敗: {e}")
        exit(1)


def month_bounds(dt: datetime) -> tuple[datetime, datetime]:
    """回傳資料月份分區的起訖時間。"""
    start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = start.replace(year=start.year + 1, month=1) if start.month == 12 \
          else start.replace(month=start.month + 1)
    return start, end


def ensure_mpl_partitions(conn, measure_times: list[datetime]) -> None:
    """依資料月份自動建立 mpl_data 分區（已存在則跳過）。"""
    months = sorted({month_bounds(dt) for dt in measure_times if dt is not None})
    if not months:
        return
    with conn.cursor() as cur:
        for start, end in months:
            partition_name = f"mpl_data_{start:%Y_%m}"
            cur.execute(
                sql.SQL(
                    "CREATE TABLE IF NOT EXISTS {p} "
                    "PARTITION OF mpl_data FOR VALUES FROM (%s) TO (%s)"
                ).format(p=sql.Identifier(partition_name)),
                (start, end),
            )
    conn.commit()
    log.info(f"  分區確認完畢（{len(months)} 個月份）")


def safe_float(v) -> Optional[float]:
    """將值轉為 float，inf/nan/-999.99 回傳 None。"""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f) or abs(f - (-999.99)) < 0.01:
        return None
    return f


def parse_tw_time_to_utc(tw_iso: str) -> Optional[datetime]:
    """將 +08:00 ISO 字串轉為 naive UTC datetime。"""
    try:
        dt = datetime.fromisoformat(tw_iso)
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        return None


def infer_station_id(filename: str) -> str:
    """從 JSON 檔名解析 station_id（mmpl{SN}_{Site}）。
    e.g. MMPL_L1_NRB_20260810_mmpl5009_Guanyin_V1.json → mmpl5009_Guanyin
    """
    stem = Path(filename).stem.lower()
    # 找 mmpl{digits} 段
    m = re.search(r"(mmpl\d+)_([a-z]+)", stem)
    if m:
        return f"{m.group(1)}_{m.group(2).capitalize()}"
    return "unknown"


def ensure_station(conn, station_id: str) -> None:
    """確保測站記錄存在（不存在則插入最小資料，待人工補充）。"""
    m = re.match(r"mmpl(\d+)_(.+)", station_id, re.IGNORECASE)
    serial_no = m.group(1) if m else None
    site_name = m.group(2) if m else station_id
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO mpl_stations (station_id, site_name, serial_no)
            VALUES (%s, %s, %s)
            ON CONFLICT (station_id) DO NOTHING
            """,
            (station_id, site_name, serial_no),
        )
    conn.commit()


def sync_range_bins(conn, station_id: str, range_km_list: list[float]) -> None:
    """將高度層清單寫入 mpl_range_bins（已存在則跳過）。"""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM mpl_range_bins WHERE station_id = %s",
            (station_id,),
        )
        existing = cur.fetchone()[0]
        if existing == len(range_km_list):
            return  # 已同步，不重複寫入

        log.info(f"  同步高度層定義：{len(range_km_list)} 個 bins")
        rows = [(station_id, idx, km) for idx, km in enumerate(range_km_list)]
        execute_batch(
            cur,
            """
            INSERT INTO mpl_range_bins (station_id, bin_index, range_km)
            VALUES (%s, %s, %s)
            ON CONFLICT (station_id, bin_index) DO NOTHING
            """,
            rows,
            page_size=1000,
        )
    conn.commit()

# ===========================================================
# 3. JSON 解析與匯入
# ===========================================================

def import_json_file(conn, file_path: Path, source: str) -> dict:
    """讀取單一 MPL JSON 檔並匯入 mpl_data。"""
    log.info(f"▶ 處理檔案: {file_path.name}")
    stats = {"total": 0, "inserted": 0, "skipped": 0}

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 從 JSON 內容取得 station，若無則從檔名推斷
    station_name = data.get("station", "")
    station_id   = infer_station_id(file_path.name)

    ensure_station(conn, station_id)

    range_km = data.get("rangeKm", [])
    if range_km:
        sync_range_bins(conn, station_id, range_km)

    times   = data.get("times", [])
    panels  = data.get("panels", {})
    nrb_z   = panels.get("nrb", {}).get("z")      # [height][time] 轉置後的矩陣
    temp_p  = panels.get("temperature", {})
    bg_p    = panels.get("backgroundEnergy", {})

    if not times:
        log.warning(f"  [SKIP] 無時間資料：{file_path.name}")
        return stats

    # 將 nrb_z [height][time] 轉回 [time][height]（存入 DB 時用 time 為主鍵）
    n_times  = len(times)
    n_bins   = len(range_km)

    def col_at(lst: Optional[list], i: int) -> Optional[float]:
        if lst is None or i >= len(lst):
            return None
        return safe_float(lst[i])

    def nrb_row_at(height_time_matrix: Optional[list], time_idx: int) -> Optional[list]:
        """從 [height][time] 矩陣取出第 time_idx 列，回傳 [height] 陣列。"""
        if not height_time_matrix:
            return None
        return [
            safe_float(height_time_matrix[hi][time_idx])
            if time_idx < len(height_time_matrix[hi]) else None
            for hi in range(len(height_time_matrix))
        ]

    nrb_co_mat = nrb_z  # Co-polar，已是 [height][time]
    # Cross-polar depol 是 log10(Cr/(Co+Cr))，原始 NRB_Cr 不在 panels 內
    # → nrb_cr 從 depol 反推不合理，此處標記為 None，待未來擴充
    nrb_cr_mat = None

    rows = []
    for i, tw_iso in enumerate(times):
        stats["total"] += 1
        utc_time = parse_tw_time_to_utc(tw_iso)
        if utc_time is None:
            stats["skipped"] += 1
            continue

        co_arr = nrb_row_at(nrb_co_mat, i)
        cr_arr = nrb_row_at(nrb_cr_mat, i)

        row = (
            station_id,
            utc_time,
            col_at(bg_p.get("energy"),           i),   # energy_uj
            col_at(temp_p.get("laser"),           i),   # las_temp_c
            col_at(temp_p.get("detector"),        i),   # det_temp_c
            col_at(temp_p.get("box"),             i),   # box_temp_c
            col_at(bg_p.get("background_log10"),  i),   # bg_avg_mhz（log10 預運算值）
            None,                                        # bg_std_mhz（JSON 中未輸出）
            co_arr,                                      # nrb_co[]
            cr_arr,                                      # nrb_cr[]
            "good",
            source,
        )
        rows.append(row)

    if not rows:
        log.warning(f"  [SKIP] 解析後無有效資料列")
        return stats

    # 確保分區存在
    ensure_mpl_partitions(conn, [r[1] for r in rows])

    # 批次寫入
    insert_sql = """
        INSERT INTO mpl_data
            (station_id, measure_time,
             energy_uj, las_temp_c, det_temp_c, box_temp_c,
             bg_avg_mhz, bg_std_mhz,
             nrb_co, nrb_cr,
             data_quality, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (station_id, measure_time) DO UPDATE SET
            energy_uj    = EXCLUDED.energy_uj,
            las_temp_c   = EXCLUDED.las_temp_c,
            det_temp_c   = EXCLUDED.det_temp_c,
            box_temp_c   = EXCLUDED.box_temp_c,
            bg_avg_mhz   = EXCLUDED.bg_avg_mhz,
            bg_std_mhz   = EXCLUDED.bg_std_mhz,
            nrb_co       = EXCLUDED.nrb_co,
            nrb_cr       = EXCLUDED.nrb_cr,
            data_quality = EXCLUDED.data_quality,
            source       = EXCLUDED.source
        WHERE mpl_data.source = 'realtime'
           OR EXCLUDED.source = 'history'
    """
    try:
        with conn.cursor() as cur:
            execute_batch(cur, insert_sql, rows, page_size=500)
        conn.commit()
        stats["inserted"] = len(rows) - stats["skipped"]
        log.info(f"  ✅ 成功匯入 {stats['inserted']} 列（跳過 {stats['skipped']} 列）")
    except Exception as e:
        conn.rollback()
        log.error(f"  ❌ 匯入失敗: {e}")

    return stats

# ===========================================================
# 4. 主程式
# ===========================================================

def main():
    parser = argparse.ArgumentParser(description="MPL 氣膠光達資料匯入工具")
    default_dir = Path(__file__).parent.parent / "data" / "raw" / "MPL" / "json"
    group = parser.add_mutually_exclusive_group(required=False)
    group.add_argument("--file", type=Path, help="單一 JSON 檔案路徑")
    group.add_argument("--dir",  type=Path, default=default_dir,
                       help="JSON 目錄（批次匯入，預設 data/raw/MPL/json）")
    parser.add_argument("--source", choices=["realtime", "history"],
                        default="realtime",
                        help="資料來源標記（預設 realtime；月末校正版用 history）")
    args = parser.parse_args()

    # 收集要匯入的檔案
    if args.file:
        files = [args.file]
    else:
        if not args.dir.exists():
            log.error(f"[ERROR] 資料目錄不存在: {args.dir}")
            exit(1)
        files = sorted(args.dir.glob("*.json"))
        log.info(f"📂 批次模式：在 {args.dir} 找到 {len(files)} 個 JSON 檔案")

    conn = connect_db()
    total = {"files": 0, "rows": 0}

    for f in files:
        if not f.is_file():
            continue
        res = import_json_file(conn, f, args.source)
        total["files"] += 1
        total["rows"]  += res.get("inserted", 0)

    conn.close()
    log.info(
        f"🏁 匯入完成！處理 {total['files']} 個檔案，"
        f"共新增 / 更新 {total['rows']} 列資料。"
    )


if __name__ == "__main__":
    main()
