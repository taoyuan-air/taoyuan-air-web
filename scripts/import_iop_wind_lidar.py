#!/usr/bin/env python3
"""
IOP WindLidar 匯入：讀取 SFTP 上傳的 txt 檔，匯入現有的 wind_lidar_data 資料表。

資料來源路徑（VM 上的 SFTP 上傳資料夾，可用環境變數 SFTP_UPLOADS_DIR 覆寫 /data/sftp_root/uploads）：
  /data/sftp_root/uploads/TYDEP/2026IOP1/WindLidar
  /data/sftp_root/uploads/TYDEP/2026IOP2/WindLidar

檔名格式（2026/11 助理重新命名，儀器序號在最前面）：
  DWL_L02240328_L1_UVW_20260327_Guanyin_V1.txt
  儀器_儀器序號_資料級別_量測主要參數_觀測年月日(UTC)_測站_反演版本

用法（專案根目錄）：
  python scripts/import_iop_wind_lidar.py
  python scripts/import_iop_wind_lidar.py --iop IOP1
  python scripts/import_iop_wind_lidar.py --iop IOP2 --skip-existing
  python scripts/import_iop_wind_lidar.py --raw-dir /data/sftp_root/uploads/TYDEP --skip-existing
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
    load_dotenv(Path(__file__).resolve().parent.parent / '.env')
except ImportError:
    pass

# ── 路徑設定 ──────────────────────────────────────────────────────────────────
SFTP_UPLOADS_DIR = Path(os.getenv('SFTP_UPLOADS_DIR', '/data/sftp_root/uploads'))

IOP_DIRS = {
    'IOP1': SFTP_UPLOADS_DIR / 'TYDEP' / '2026IOP1' / 'WindLidar',
    'IOP2': SFTP_UPLOADS_DIR / 'TYDEP' / '2026IOP2' / 'WindLidar',
}

# ── 資料庫連線設定 ─────────────────────────────────────────────────────────────
DB_CONFIG = {
    'host':     os.getenv('POSTGRES_HOST',     'localhost'),
    'port':     os.getenv('POSTGRES_PORT',     '5432'),
    'database': os.getenv('POSTGRES_DB',       'taoyuan_air'),
    'user':     os.getenv('POSTGRES_USER',     'taoyuan_user'),
    'password': os.getenv('POSTGRES_PASSWORD'),
}

# ── 檔名解析 ──────────────────────────────────────────────────────────────────
# DWL_L02240328_L1_UVW_20260327_Guanyin_V1.txt（儀器序號在最前面）
FILENAME_PATTERN = re.compile(
    r'^DWL_(?P<serial>[A-Za-z]\d+)_L(?P<level>\d+)_(?P<params>[A-Za-z]+)_'
    r'(?P<date>\d{8})_(?P<site>[A-Za-z]+)_V(?P<version>\d+)\.txt$',
    re.IGNORECASE,
)

# ── 量測參數對照（txt 欄位名 → wind_lidar_data 欄位）──────────────────────────
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
PARAM_COLUMNS  = list(PARAM_MAP.values())

INSERT_SQL = f"""
    INSERT INTO wind_lidar_data
        (station_id, measure_time, height_m, {', '.join(PARAM_COLUMNS)})
    VALUES (%s, %s, %s, {', '.join(['%s'] * len(PARAM_COLUMNS))})
    ON CONFLICT (station_id, measure_time, height_m) DO NOTHING
"""


# ── 輔助函式 ──────────────────────────────────────────────────────────────────

def connect_db():
    if not DB_CONFIG['password']:
        print('[ERROR] 缺少 POSTGRES_PASSWORD 環境變數')
        sys.exit(1)
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print('[OK] 資料庫連線成功')
        return conn
    except psycopg2.OperationalError as e:
        print(f'[ERROR] 資料庫連線失敗：{e}')
        sys.exit(1)


def parse_filename(filename: str) -> Optional[dict]:
    """解析風光達檔名，回傳 metadata dict 或 None。"""
    m = FILENAME_PATTERN.match(filename)
    if not m:
        return None
    return {
        'version':    m.group('version'),
        'level':      m.group('level'),
        'params':     m.group('params'),
        'date':       m.group('date'),
        'serial':     m.group('serial'),
        'site':       m.group('site'),
        'station_id': f"{m.group('serial')}_{m.group('site')}",
    }


def find_txt_files(dirs: list[Path]) -> list[Path]:
    """在多個資料夾中遞迴找出符合檔名格式的 txt 檔，依檔名排序。"""
    files = []
    for d in dirs:
        if not d.exists():
            print(f'[WARN] 資料夾不存在，略過：{d}')
            continue
        files.extend(p for p in d.rglob('*') if p.is_file() and parse_filename(p.name))
    return sorted(set(files), key=lambda p: p.name)


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


def parse_value(raw: str, param_id: str) -> Optional[float]:
    try:
        value = float(raw)
    except (ValueError, TypeError):
        return None
    if not math.isfinite(value):
        return None
    if param_id in INTEGER_PARAMS:
        return int(value)
    return round(value, 3)


def day_bounds(dt: datetime) -> tuple[datetime, datetime]:
    start = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def ensure_partitions(conn, measure_times: list[datetime]) -> None:
    """依資料 UTC 日期自動建立 wind_lidar_data 日分區。"""
    days = sorted({day_bounds(dt) for dt in measure_times if dt is not None})
    if not days:
        return
    with conn.cursor() as cur:
        for start, end in days:
            partition_name        = f"wind_lidar_data_{start:%Y_%m_%d}"
            legacy_partition_name = f"wind_lidar_data_{start:%Y%m%d}"
            cur.execute(
                "SELECT to_regclass(%s), to_regclass(%s)",
                (partition_name, legacy_partition_name),
            )
            if any(cur.fetchone()):
                continue
            cur.execute(
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


def parse_txt_file(filepath: Path, station_id: str):
    """逐列解析 txt，yield (station_id, measure_time, height_m, *params)。"""
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            t = row.get('Date/time', '').strip()
            if not t:
                continue
            try:
                measure_time = datetime.strptime(t, '%Y-%m-%d %H:%M')
            except ValueError:
                continue
            try:
                height_m = float(row['Height'])
            except (ValueError, KeyError):
                continue
            values = [
                parse_value((row.get(field) or '').strip(), param_id)
                for field, param_id in PARAM_MAP.items()
            ]
            yield (station_id, measure_time, height_m, *values)


def delete_days(cur, station_id: str, measure_times: list[datetime]) -> int:
    """刪掉同測站、落在本檔時間範圍內（首筆～末筆）的舊資料，回傳刪除筆數。

    不能整天刪：IOP1 的檔案最後一筆是隔天 00:00，若整天刪，
    下一個檔匯入時會把前一個檔留下的 00:00 刪掉，而下一個檔本身從 00:10 開始，
    00:00 那筆就永遠不見了。
    """
    cur.execute(
        """
        DELETE FROM wind_lidar_data
        WHERE station_id = %s AND measure_time BETWEEN %s AND %s
        """,
        (station_id, min(measure_times), max(measure_times)),
    )
    return cur.rowcount


def import_txt_file(conn, filepath: Path) -> Optional[tuple[int, int, int, int]]:
    """匯入單一 txt 檔，回傳 (total, valid, invalid, deleted)；失敗回傳 None。"""
    meta = parse_filename(filepath.name)
    if not meta:
        print('檔名格式不符，跳過')
        return None

    rows = list(parse_txt_file(filepath, meta['station_id']))
    if not rows:
        print('沒有可匯入的資料列（檔案內容格式可能不同）')
        return None

    valid   = sum(1 for r in rows if r[3] is not None)   # hsp 有值
    invalid = len(rows) - valid

    try:
        ensure_partitions(conn, [r[1] for r in rows])
        with conn.cursor() as cur:
            deleted = delete_days(cur, meta['station_id'], [r[1] for r in rows])
            execute_batch(cur, INSERT_SQL, rows, page_size=5000)
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'[ERROR] 匯入失敗：{e}')
        return None

    return len(rows), valid, invalid, deleted


# ── 主程式 ────────────────────────────────────────────────────────────────────

def main():
    print('=' * 60)
    print('IOP WindLidar 資料匯入工具')
    print('=' * 60)

    ap = argparse.ArgumentParser(
        description='IOP WindLidar txt → wind_lidar_data（SFTP 上傳路徑）'
    )
    ap.add_argument(
        '--raw-dir', type=Path, default=None,
        help='覆蓋預設資料夾（預設同時掃 2026IOP1/WindLidar 與 2026IOP2/WindLidar）',
    )
    ap.add_argument(
        '--iop', choices=['IOP1', 'IOP2'], default=None,
        help='只匯入指定 IOP（不填則兩個都匯入）',
    )
    ap.add_argument(
        '--skip-existing', action='store_true',
        help='資料庫已有該日期資料的檔案直接跳過',
    )
    ap.add_argument(
        '--dry-run', action='store_true',
        help='只掃描並列出檔案，不寫入資料庫',
    )
    args = ap.parse_args()

    # 決定要掃描的資料夾
    if args.raw_dir:
        search_dirs = [args.raw_dir]
    elif args.iop:
        search_dirs = [IOP_DIRS[args.iop]]
    else:
        search_dirs = list(IOP_DIRS.values())

    txt_files = find_txt_files(search_dirs)

    if not txt_files:
        print(f'[INFO] 找不到符合格式的 txt 檔')
        for d in search_dirs:
            print(f'       {d}')
        return

    print(f'\n找到 {len(txt_files)} 個 txt 檔案')
    print('-' * 60)

    if args.dry_run:
        for path in txt_files:
            meta = parse_filename(path.name)
            iop_label = ''
            for iop_key, iop_dir in IOP_DIRS.items():
                try:
                    path.relative_to(iop_dir)
                    iop_label = f'[{iop_key}] '
                    break
                except ValueError:
                    pass
            print(f'  {iop_label}{path.name}')
            if meta:
                print(f'    station={meta["station_id"]}  date={meta["date"]}  version=V{meta["version"]}')
            else:
                print(f'    [WARN] 檔名格式不符')
        return

    conn = connect_db()

    if args.skip_existing:
        before = len(txt_files)
        txt_files = [
            p for p in txt_files
            if not (lambda m: m and already_imported(conn, m['station_id'], m['date']))(parse_filename(p.name))
        ]
        print(f'[INFO] 已匯入過 {before - len(txt_files)} 個檔案，略過')

    grand_total = grand_valid = grand_invalid = grand_deleted = 0
    failed = 0

    for idx, path in enumerate(txt_files, 1):
        print(f'  [{idx:2d}/{len(txt_files)}] {path.name} ...', end=' ', flush=True)
        result = import_txt_file(conn, path)
        if result is None:
            failed += 1
            continue
        total, valid, invalid, deleted = result
        grand_total   += total
        grand_valid   += valid
        grand_invalid += invalid
        grand_deleted += deleted
        note = f'，取代舊資料 {deleted:,} 列' if deleted else ''
        print(f'解析 {total:,} 列  (有效:{valid:,} 無效:{invalid:,}){note}')

    conn.close()

    print('\n' + '=' * 60)
    print('匯入完成' if not failed else f'匯入完成，{failed} 個檔案失敗')
    print('=' * 60)
    print(f'解析總列數：{grand_total:,}')
    if grand_total:
        print(f'有效      ：{grand_valid:,}  ({grand_valid / grand_total * 100:.1f}%)')
    print(f'無效      ：{grand_invalid:,}')
    print(f'取代舊資料：{grand_deleted:,}')
    print('=' * 60)
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
