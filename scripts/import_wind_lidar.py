#!/usr/bin/env python3
"""
WindLidar 資料匯入腳本
讀取風光達 txt 並批次匯入 PostgreSQL

檔名格式（新舊皆支援）：
  新（2026/08 起，SFTP）：DWL_L1_UVW_20260811_L02240328_Guanyin_V1.txt
                          儀器_資料級別_量測主要參數_觀測起始年月日_儀器版本_測站_反演版本
  舊（Google 雲端）    ：DWL_V1_L1_UVW_20260330_L02240328_Guanyin.txt

資料來源資料夾（預設 data/raw/WindLidar，會遞迴搜尋子資料夾）：
  python scripts/import_wind_lidar.py
  python scripts/import_wind_lidar.py --raw-dir /data/sftp_root/uploads/WindLidar --skip-existing

資料規模：每天 109,440 列（760 層 × 144 時間點），7 個參數各一欄
資料品質：無法轉為數值的參數存 NULL；水平風速有值才算有效列
時區說明：原始 txt 為 UTC，以 TIMESTAMP 存入 DB（UTC）
          查詢時透過 wind_lidar_latest View 的 measure_time_tw 欄位取得台灣時間
"""

import argparse
import csv
import math
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

try:
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extras import execute_batch
except ImportError:
    print('[ERROR] 請先安裝 psycopg2：pip3 install psycopg2-binary')
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── 資料庫連線設定 ─────────────────────────────────────────────────────────────
DB_CONFIG = {
    'host':     os.getenv('POSTGRES_HOST',  'localhost'),
    'port':     os.getenv('POSTGRES_PORT',  '5432'),
    'database': os.getenv('POSTGRES_DB',    'taoyuan_air'),
    'user':     os.getenv('POSTGRES_USER',  'taoyuan_user'),
    'password': os.getenv('POSTGRES_PASSWORD'),
}

if not DB_CONFIG['password']:
    print('[ERROR] 缺少 POSTGRES_PASSWORD 環境變數')
    sys.exit(1)

# ── 路徑設定 ──────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent.parent
RAW_DIR  = ROOT_DIR / 'data' / 'raw' / 'WindLidar'

# 新：DWL_L1_UVW_20260811_L02240328_Guanyin_V1.txt（反演版本在最後）
# 舊：DWL_V1_L1_UVW_20260330_L02240328_Guanyin.txt（反演版本在第二段）
FILENAME_PATTERN = re.compile(
    r'^DWL_(?:V(?P<old_version>\d+)_)?L(?P<level>\d+)_(?P<params>[A-Za-z]+)_'
    r'(?P<date>\d{8})_(?P<serial>[A-Za-z0-9]+)_(?P<site>[A-Za-z]+)'
    r'(?:_V(?P<new_version>\d+))?\.txt$',
    re.IGNORECASE,
)


def parse_filename(filename: str) -> Optional[dict]:
    """
    解析風光達檔名，回傳 metadata dict 或 None。

    範例：DWL_L1_UVW_20260330_L02240328_Guanyin_V1.txt
         或 DWL_V1_L1_UVW_20260330_L02240328_Guanyin.txt
    → {
        'version': '1',
        'level': '1',
        'params': 'UVW',
        'date': '20260330',
        'serial': 'L02240328',
        'site': 'Guanyin',
        'station_id': 'L02240328_Guanyin'
      }
    """
    m = FILENAME_PATTERN.match(filename)
    if not m:
        return None
    # 反演版本必須出現在新位置或舊位置其中之一
    version = m.group('new_version') or m.group('old_version')
    if not version:
        return None
    return {
        'version': version,
        'level':   m.group('level'),
        'params':  m.group('params'),
        'date':    m.group('date'),
        'serial':  m.group('serial'),
        'site':    m.group('site'),
        'station_id': f"{m.group('serial')}_{m.group('site')}",
    }


def find_txt_files(raw_dir: Path) -> list[Path]:
    """遞迴找出所有符合檔名格式的風光達檔案（SFTP 依 測站/級別/年份 分資料夾）。"""
    return sorted(
        (p for p in raw_dir.rglob('*') if p.is_file() and parse_filename(p.name)),
        key=lambda p: p.name,
    )


def already_imported(conn, station_id: str, date_str: str) -> bool:
    """該測站在檔名日期（UTC）是否已有資料。"""
    day = datetime.strptime(date_str, '%Y%m%d')
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM wind_lidar_data
            WHERE station_id = %s AND measure_time >= %s AND measure_time < %s
            LIMIT 1
            """,
            (station_id, day, day + timedelta(days=1)),
        )
        return cur.fetchone() is not None

# ── 參數對照（txt 欄位名 → parameter_id）────────────────────────────────────
PARAM_MAP = {
    'Hsp':       'hsp',
    'Vsp':       'vsp',
    'Wdir':      'wdir',
    'Turb':      'turb',
    'Min int.':  'min_int',
    'Mean int.': 'mean_int',
    'n':         'n_samples',
}

INTEGER_PARAMS = {'n_samples'}

PARAM_COLUMNS = list(PARAM_MAP.values())

INSERT_SQL = f"""
    INSERT INTO wind_lidar_data
        (station_id, measure_time, height_m, {', '.join(PARAM_COLUMNS)})
    VALUES (%s, %s, %s, {', '.join(['%s'] * len(PARAM_COLUMNS))})
    ON CONFLICT (station_id, measure_time, height_m) DO NOTHING
"""


def connect_db():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print('[OK] 資料庫連線成功')
        return conn
    except Exception as e:
        print(f'[ERROR] 資料庫連線失敗: {e}')
        return None


def parse_value(raw: str, param_id: str) -> Optional[float]:
    try:
        value = float(raw)
    except (ValueError, TypeError):
        return None
    if not math.isfinite(value):   # NaN / inf 視為無效
        return None
    if param_id in INTEGER_PARAMS:
        return int(value)
    return round(value, 3)


def day_bounds(dt: datetime) -> tuple[datetime, datetime]:
    """回傳 WindLidar UTC 日分區起訖時間。"""
    start = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start, end


def ensure_wind_lidar_partitions(conn, measure_times: list[datetime]) -> None:
    """依資料 UTC 日期自動建立 wind_lidar_data 日分區。"""
    days = sorted({day_bounds(dt) for dt in measure_times if dt is not None})
    if not days:
        return

    cursor = None
    try:
        cursor = conn.cursor()
        for start, end in days:
            partition_name = f"wind_lidar_data_{start:%Y_%m_%d}"
            legacy_partition_name = f"wind_lidar_data_{start:%Y%m%d}"
            cursor.execute(
                "SELECT to_regclass(%s), to_regclass(%s)",
                (partition_name, legacy_partition_name),
            )
            if any(cursor.fetchone()):
                continue

            cursor.execute(
                sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {partition}
                    PARTITION OF wind_lidar_data
                    FOR VALUES FROM (%s) TO (%s)
                    """
                ).format(partition=sql.Identifier(partition_name)),
                (start, end),
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'    [ERROR] WindLidar 分區建立失敗: {e}')
        raise
    finally:
        if cursor:
            cursor.close()


def parse_txt_file(filepath: Path, station_id: str):
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            t = row.get('Date/time', '').strip()
            if not t:
                continue

            # 原始時間為 UTC，直接以 UTC TIMESTAMP 儲存，不做 +8 轉換
            # 台灣時間轉換在 View 層（measure_time_tw）處理
            try:
                measure_time = datetime.strptime(
                    t, '%Y-%m-%d %H:%M'
                )
            except ValueError:
                continue

            try:
                height_m = float(row['Height'])
            except (ValueError, KeyError):
                continue

            values = [
                parse_value((row.get(field_name) or '').strip(), param_id)
                for field_name, param_id in PARAM_MAP.items()
            ]
            yield (station_id, measure_time, height_m, *values)


def import_txt_file(conn, filepath: Path) -> tuple:
    """匯入單一 txt 檔，回傳 (total, valid, invalid)。"""
    meta = parse_filename(filepath.name)
    if not meta:
        print(f'\n    [WARN] 檔名格式不符，跳過: {filepath.name}')
        return 0, 0, 0

    station_id = meta['station_id']

    rows    = []
    valid   = 0
    invalid = 0

    for row in parse_txt_file(filepath, station_id):
        rows.append(row)
        if row[3] is not None:   # hsp 有值
            valid += 1
        else:
            invalid += 1

    if not rows:
        return 0, 0, 0

    cursor = None
    try:
        ensure_wind_lidar_partitions(conn, [row[1] for row in rows])
        cursor = conn.cursor()
        execute_batch(cursor, INSERT_SQL, rows, page_size=5000)
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'    [ERROR] 匯入失敗: {e}')
        return 0, 0, 0
    finally:
        if cursor:
            cursor.close()

    return len(rows), valid, invalid


def main():
    print('=' * 60)
    print('WindLidar 資料匯入工具（直接 txt → DB）')
    print('=' * 60)

    parser = argparse.ArgumentParser(description='WindLidar txt → PostgreSQL')
    parser.add_argument('files', nargs='*', help='指定檔名（相對於 --raw-dir）；不填則匯入整個資料夾')
    parser.add_argument('--raw-dir', type=Path,
                        default=Path(os.getenv('WIND_LIDAR_RAW_DIR', str(RAW_DIR))),
                        help='資料夾（預設 data/raw/WindLidar，可設環境變數 WIND_LIDAR_RAW_DIR）')
    parser.add_argument('--skip-existing', action='store_true',
                        help='資料庫已有該日期資料的檔案直接跳過（排程用，避免每次重匯全部）')
    args = parser.parse_args()
    raw_dir = args.raw_dir

    if args.files:
        txt_files = [raw_dir / filename for filename in args.files]
        missing_files = [path.name for path in txt_files if not path.is_file()]
        if missing_files:
            print(f'[ERROR] 找不到指定檔案：{", ".join(missing_files)}')
            sys.exit(1)
    else:
        txt_files = find_txt_files(raw_dir)

    if not txt_files:
        print(f'[INFO] 沒有可匯入的 txt 檔案：{raw_dir}')
        return

    conn = connect_db()
    if not conn:
        sys.exit(1)

    if args.skip_existing:
        remaining = []
        for path in txt_files:
            meta = parse_filename(path.name)
            if meta and already_imported(conn, meta['station_id'], meta['date']):
                continue
            remaining.append(path)
        print(f'[INFO] 已匯入過 {len(txt_files) - len(remaining)} 個檔案，略過')
        txt_files = remaining

    print(f'\n找到 {len(txt_files)} 個 txt 檔案')
    print('-' * 60)

    grand_total = grand_valid = grand_invalid = 0

    for idx, txt_path in enumerate(txt_files, 1):
        print(f'  [{idx:2d}/{len(txt_files)}] {txt_path.name} ...', end=' ', flush=True)
        total, valid, invalid = import_txt_file(conn, txt_path)
        grand_total   += total
        grand_valid   += valid
        grand_invalid += invalid
        print(f'解析 {total:,} 列  (有效:{valid:,} 無效:{invalid:,})')

    conn.close()

    print('\n' + '=' * 60)
    print('匯入完成')
    print('=' * 60)
    print(f'解析總列數: {grand_total:,}')
    if grand_total:
        print(f'有效    : {grand_valid:,}  ({grand_valid / grand_total * 100:.1f}%)')
    print(f'無效    : {grand_invalid:,}')
    print('=' * 60)
    print('\n驗證指令：')
    print('  docker exec -it taoyuan-air-db psql -U taoyuan_user -d taoyuan_air')
    print('  SELECT COUNT(*) FROM wind_lidar_data;')
    print('  SELECT * FROM check_wind_lidar_quality();')


if __name__ == '__main__':
    main()
