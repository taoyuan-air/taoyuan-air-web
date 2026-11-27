#!/usr/bin/env python3
"""
IOP UAS（無人機）匯入腳本：讀取 IOP 期間的無人機垂直剖面 txt，匯入 PostgreSQL 的 uav_flights / uav_data

檔名（格式說明見 data/DATA_GUIDE.md）：
  UAS_Aeromount-M4_L2_gas_20260330_1647_Guanyin_V1.txt   氣象、PM、氣體
  UAS_POM-1782_L2_o3_20260330_1647_Guanyin_V1.txt        POM 臭氧儀（IOP2 為 POM-1720）
  同一趟飛行（YYYYMMDD_HHMM）的各儀器檔合併為一筆 flight_id；O3 以 POM 臭氧儀為準。
  重匯時整趟飛行重寫。

資料來源（VM 的 SFTP 上傳資料夾，只保留 IOP 期間）：
  /data/sftp_root/uploads/TYDEP/2026IOP{1,2}/UAS/
  可用環境變數 SFTP_UPLOADS_DIR 覆寫 /data/sftp_root/uploads

-999（Missing_value）、-888（QC_rejected）與 NaN 一律不當成數值。

用法：
  python scripts/import_iop_uas.py                          # 讀 /data/sftp_root/uploads/TYDEP（IOP1、IOP2）
  python scripts/import_iop_uas.py --dry-run                # 只解析不寫入
  python scripts/import_iop_uas.py --raw-dir data/raw/UAS   # 本機測試
"""

import argparse
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
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
RAW_DIR = Path(os.getenv('SFTP_UPLOADS_DIR', '/data/sftp_root/uploads')) / 'TYDEP'

# UAS_Aeromount-M4_L2_gas_20260330_1647_Guanyin_V1.txt
FILENAME_PATTERN = re.compile(
    r'^UAS_(?P<instrument>.+?)_L(?P<level>\d+)_(?P<meas_type>[A-Za-z0-9]+)_(?P<date>\d{8})_'
    r'(?P<time>\d{4})_(?P<site>[A-Za-z]+)_V(?P<version>\d+)\.txt$',
    re.IGNORECASE,
)

# ── 量測參數欄位（不含 agl，agl 單獨作為層鍵 agl_m）────────────────────────
PARAM_COLS = [
    'asl', 'P', 'T', 'RH', 'PM1', 'PM2.5', 'PM10',
    'ws', 'wd', 'theta', 'Td', 'q', 'mixR', 'Tv', 'thetav',
    'O3', 'CO', 'CO2', 'SO2', 'NO2', 'NH3', 'H2S', 'TVOC',
]

MEASUREMENT_PARAM_COLS = [param_id for param_id in PARAM_COLS if param_id != 'asl']

HEADER_ALIASES = {
    'PM25': 'PM2.5',
    'PM2p5': 'PM2.5',
}

# 儀器檔的「主要量測」：同一高度兩個檔都有有效值時，以專用儀器為準
MEAS_TYPE_PARAM = {'o3': 'O3'}

DEFAULT_MISSING_VALUE = -999.0
DEFAULT_QC_REJECTED   = -888.0

MAX_AGL_M = 3000.0

# 預設值（檔頭沒有時使用）
DEFAULT_LATITUDE  = 25.0605
DEFAULT_LONGITUDE = 121.1288
DEFAULT_ALTITUDE  = 17.0

INSERT_SQL = """
    INSERT INTO uav_data
        (flight_id, agl_m, parameter_id, raw_value, value, data_quality)
    VALUES (%s, %s, %s, %s, %s, %s)
    ON CONFLICT (flight_id, agl_m, parameter_id) DO UPDATE SET
        raw_value    = EXCLUDED.raw_value,
        value        = EXCLUDED.value,
        data_quality = EXCLUDED.data_quality
"""


# ── 檔名 ──────────────────────────────────────────────────────────────────────
def parse_filename(filename: str) -> Optional[dict]:
    """
    解析 UAS 檔名，回傳 metadata dict 或 None。

    範例：UAS_POM-1782_L2_o3_20260330_1647_Guanyin_V1.txt
    → {'level': 'L2', 'level_num': 2, 'meas_type': 'o3',
       'date': '20260330', 'time': '1647', 'instrument': 'POM-1782',
       'site': 'Guanyin', 'version': '1', 'flight_id': '20260330_1647'}
    """
    m = FILENAME_PATTERN.match(filename)
    if not m:
        return None
    return {
        'level':      f"L{m.group('level')}",
        'level_num':  int(m.group('level')),
        'meas_type':  m.group('meas_type').lower(),
        'date':       m.group('date'),
        'time':       m.group('time'),
        'instrument': m.group('instrument'),
        'site':       m.group('site'),
        'version':    m.group('version'),
        'flight_id':  f"{m.group('date')}_{m.group('time')}",
    }


def find_flight_files(raw_dir: Path) -> dict:
    """
    遞迴搜尋 raw_dir，依 flight_id 分組；同一趟飛行取最高資料級別的檔案。
    回傳 {flight_id: [(path, fname_meta), ...]}
    """
    groups = defaultdict(list)
    for path in raw_dir.rglob('*'):
        if not path.is_file():
            continue
        meta = parse_filename(path.name)
        if meta:
            groups[meta['flight_id']].append((path, meta))

    selected = {}
    for flight_id, items in sorted(groups.items()):
        top_level = max(m['level_num'] for _, m in items)
        selected[flight_id] = sorted(
            [(p, m) for p, m in items if m['level_num'] == top_level],
            key=lambda pm: pm[0].name,
        )
    return selected


# ── 檔頭 ──────────────────────────────────────────────────────────────────────
def parse_file_metadata(lines: list[str]) -> tuple[dict, int]:
    """
    解析檔案開頭的 metadata header（key: value 格式），
    回傳 (metadata_dict, data_start_index)。key 一律轉小寫。
    data_start_index 指向分隔線 '==' 之後的下一行；沒有分隔線時回傳 0。
    """
    metadata = {}

    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('=='):
            return metadata, i + 1
        if ':' in stripped:
            key, _, val = stripped.partition(':')
            metadata[key.strip().lower()] = val.strip()

    return {}, 0


def meta_get(meta: dict, *keys: str) -> Optional[str]:
    """依序嘗試多個 key，回傳第一個有值的。"""
    for key in keys:
        value = meta.get(key.lower())
        if value not in (None, ''):
            return value
    return None


def meta_number(meta: dict, *keys: str) -> Optional[float]:
    """讀取數值欄位，容許帶單位（如 '17 m'、'300 m'）。"""
    value = meta_get(meta, *keys)
    if value is None:
        return None
    m = re.match(r'^\s*(-?\d+(?:\.\d+)?)', value)
    return float(m.group(1)) if m else None


def parse_meta_date(value: Optional[str]) -> Optional[str]:
    """把 '2026/03/30' 或 '2026/03/30 16:47' 轉成 '2026-03-30'。"""
    if not value:
        return None
    m = re.match(r'^\s*(\d{4})[/-](\d{1,2})[/-](\d{1,2})', value)
    if not m:
        return None
    return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


# ── 資料列 ────────────────────────────────────────────────────────────────────
def connect_db():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print('[OK] 資料庫連線成功')
        return conn
    except Exception as e:
        print(f'[ERROR] 資料庫連線失敗: {e}')
        return None


def parse_value(raw: str, missing: float = DEFAULT_MISSING_VALUE,
                rejected: float = DEFAULT_QC_REJECTED) -> tuple:
    """
    解析單一欄位值。
    回傳 (raw_value, value, data_quality)
      NaN / 無法解析 → (raw, None, 'invalid')
      -999（Missing_value）→ (raw, None, 'missing')
      -888（QC_rejected）  → (raw, None, 'rejected')
    """
    val_str = str(raw).strip()
    if val_str.lower() == 'nan':
        return (val_str, None, 'invalid')
    try:
        num = float(val_str)
    except (ValueError, TypeError):
        return (val_str, None, 'invalid')
    if num == missing:
        return (val_str, None, 'missing')
    if num == rejected:
        return (val_str, None, 'rejected')
    return (val_str, round(num, 4), 'good')


def row_has_any_valid_measurement(row: dict, missing: float, rejected: float) -> bool:
    """排除高度欄位，判斷該高度層是否還有任一有效量測值。"""
    for param_id in MEASUREMENT_PARAM_COLS:
        if param_id not in row:
            continue
        _, value, quality = parse_value(row.get(param_id, ''), missing, rejected)
        if quality == 'good' and value is not None:
            return True
    return False


def parse_txt_file(filepath: Path) -> tuple[dict, dict]:
    """
    解析單一 txt 檔。
    回傳 (file_meta, values)，values = {(agl_m, param_id): (raw_value, value, quality)}

    - 超過 3 km 的高度層跳過
    - 檔頭有最大離地高度（Max_agl / max_agl_m）時，超過的補值層跳過
    - 所有量測欄位皆為 NaN 的高度層跳過（不中斷讀取，避免中途斷訊時遺失後段資料）
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    file_meta, data_start = parse_file_metadata(lines)
    max_agl = meta_number(file_meta, 'max_agl', 'max agl', 'max_agl_m')
    missing = meta_number(file_meta, 'missing_value')
    rejected = meta_number(file_meta, 'qc_rejected')
    missing = DEFAULT_MISSING_VALUE if missing is None else missing
    rejected = DEFAULT_QC_REJECTED if rejected is None else rejected
    values = {}

    data_lines = lines[data_start:]
    if len(data_lines) < 3:
        return file_meta, values

    # 分隔線後兩行是「單位行」與「欄位名稱行」，順序不固定
    # （IOP1：單位在上；IOP2：欄名在上），以開頭為 agl 的那行當欄位名稱
    first_cells = [line.split(',')[0].strip().lower() for line in data_lines[:2]]
    name_idx = 0 if first_cells[0] == 'agl' else 1
    col_names = [
        HEADER_ALIASES.get(column.strip(), column.strip())
        for column in data_lines[name_idx].strip().split(',')
    ]
    unknown = [c for c in col_names if c and c != 'agl' and c not in PARAM_COLS]
    if unknown:
        print(f'\n    [WARN] {filepath.name}: 未定義的欄位將略過：{", ".join(unknown)}')

    for line in data_lines[2:]:
        line = line.strip()
        if not line:
            continue

        cells = [v.strip() for v in line.split(',')]
        if len(cells) < len(col_names):
            continue

        row = dict(zip(col_names, cells))

        try:
            agl_m = float(row.get('agl', '').strip())
        except (ValueError, TypeError):
            continue

        if agl_m > MAX_AGL_M:
            continue
        if max_agl is not None and agl_m > max_agl:
            continue
        if not row_has_any_valid_measurement(row, missing, rejected):
            continue

        for param_id in PARAM_COLS:
            if param_id in row:
                values[(agl_m, param_id)] = parse_value(row[param_id], missing, rejected)

    return file_meta, values


def merge_flight(files: list) -> tuple[dict, dict]:
    """
    合併同一趟飛行的多個檔案（Aeromount gas ＋ POM o3）。
    檔頭以第一個檔為主、後面的補空缺；量測值重複（如兩檔都有 asl）時保留有效值。
    專用儀器檔（如 POM 臭氧 o3）的主要量測，有效時一律覆蓋其他檔的同欄位。
    """
    merged_meta, merged_values = {}, {}
    for path, fname_meta in files:
        file_meta, values = parse_txt_file(path)
        main_param = MEAS_TYPE_PARAM.get(fname_meta['meas_type'])
        for key, val in file_meta.items():
            merged_meta.setdefault(key, val)
        for key, val in values.items():
            prefer = main_param is not None and key[1] == main_param and val[2] == 'good'
            if (key not in merged_values or prefer
                    or (merged_values[key][2] != 'good' and val[2] == 'good')):
                merged_values[key] = val
    return merged_meta, merged_values


# ── 寫入資料庫 ────────────────────────────────────────────────────────────────
def ensure_source_format_column(conn) -> None:
    """舊資料庫補上 source_format 欄位（uav_schema.sql 也會加）。"""
    with conn.cursor() as cursor:
        cursor.execute("ALTER TABLE uav_flights ADD COLUMN IF NOT EXISTS source_format VARCHAR(10)")
    conn.commit()


def flight_instruments(files: list) -> str:
    """同一趟飛行的儀器名稱（去重、依檔名順序），如 'Aeromount-M4+POM-1782'。"""
    names = []
    for _, m in files:
        if m['instrument'] not in names:
            names.append(m['instrument'])
    return '+'.join(names)[:50]


def upsert_flight(conn, flight_id: str, fname_meta: dict, file_meta: dict,
                  instrument: str) -> None:
    """寫入／更新飛行任務基本資料，並確保 flight_id LIST 分區存在。"""
    partition_name = f"uav_data_{flight_id}"

    takeoff_time = datetime.strptime(flight_id, '%Y%m%d_%H%M')
    data_release_date = (
        parse_meta_date(meta_get(file_meta, 'data_release_date', 'data_updated_at', 'data_created_at'))
        or takeoff_time.strftime('%Y-%m-%d')
    )

    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO uav_flights
                (flight_id, flight_direction, takeoff_time, data_release_date, data_level,
                 site_name, latitude, longitude, altitude_m, instrument, max_agl_m, source_format)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (flight_id) DO UPDATE SET
                takeoff_time      = EXCLUDED.takeoff_time,
                flight_direction  = EXCLUDED.flight_direction,
                data_level        = EXCLUDED.data_level,
                data_release_date = EXCLUDED.data_release_date,
                instrument        = EXCLUDED.instrument,
                site_name         = EXCLUDED.site_name,
                latitude          = EXCLUDED.latitude,
                longitude         = EXCLUDED.longitude,
                altitude_m        = EXCLUDED.altitude_m,
                max_agl_m         = EXCLUDED.max_agl_m,
                source_format     = EXCLUDED.source_format,
                updated_at        = NOW()
            """,
            (
                flight_id,
                meta_get(file_meta, 'flight_direction') or 'ascending',
                takeoff_time,
                data_release_date,
                fname_meta['level'],
                fname_meta['site'],
                meta_number(file_meta, 'latitude') or DEFAULT_LATITUDE,
                meta_number(file_meta, 'longitude') or DEFAULT_LONGITUDE,
                meta_number(file_meta, 'elevation', 'altitude_m') or DEFAULT_ALTITUDE,
                instrument,
                meta_number(file_meta, 'max_agl', 'max agl', 'max_agl_m'),
                'uas',
            ),
        )
        cursor.execute(
            sql.SQL(
                """
                CREATE TABLE IF NOT EXISTS {partition}
                PARTITION OF uav_data
                FOR VALUES IN (%s)
                """
            ).format(partition=sql.Identifier(partition_name)),
            (flight_id,),
        )


def import_flight(conn, flight_id: str, files: list, dry_run: bool = False) -> tuple:
    """匯入一趟飛行（Aeromount ＋ POM 兩個檔），回傳 (total, valid, invalid)。"""
    fname_meta = files[0][1]

    file_meta, values = merge_flight(files)

    # 檔頭與檔名不一致時提出警告（以檔名為準）
    header_level = meta_get(file_meta, 'data_level')
    if header_level and header_level.upper() != fname_meta['level'].upper():
        print(f'\n    [WARN] {flight_id}: 檔頭 Data_level={header_level} 與檔名 {fname_meta["level"]} 不一致，以檔名為準')
    header_site = meta_get(file_meta, 'site_name')
    if header_site and header_site != fname_meta['site']:
        print(f'\n    [WARN] {flight_id}: 檔頭 Site_name={header_site} 與檔名 {fname_meta["site"]} 不一致，以檔名為準')

    rows = [
        (flight_id, agl_m, param_id, raw_value, value, quality)
        for (agl_m, param_id), (raw_value, value, quality) in sorted(values.items())
    ]
    if not rows:
        return 0, 0, 0

    valid = sum(1 for r in rows if r[5] == 'good')
    invalid = len(rows) - valid
    if dry_run:
        return len(rows), valid, invalid

    try:
        upsert_flight(conn, flight_id, fname_meta, file_meta, flight_instruments(files))
        with conn.cursor() as cursor:
            # 先清掉該飛行舊資料，避免殘留舊高度層或舊值
            cursor.execute("DELETE FROM uav_data WHERE flight_id = %s", (flight_id,))
            execute_batch(cursor, INSERT_SQL, rows, page_size=2000)
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'    [ERROR] 匯入失敗: {e}')
        return 0, 0, 0

    return len(rows), valid, invalid


def main():
    parser = argparse.ArgumentParser(description='IOP UAS txt → PostgreSQL')
    parser.add_argument('--raw-dir', type=Path, default=RAW_DIR,
                        help='資料夾（預設 /data/sftp_root/uploads/TYDEP，會遞迴讀 IOP1、IOP2 的 UAS）')
    parser.add_argument('--dry-run', action='store_true', help='只解析、不寫入資料庫')
    args = parser.parse_args()

    print('=' * 60)
    print('IOP UAS 資料匯入工具')
    print('=' * 60)

    flights = find_flight_files(args.raw_dir)
    if not flights:
        print(f'[INFO] 沒有可匯入的 txt 檔案：{args.raw_dir}')
        return

    conn = None
    if not args.dry_run:
        conn = connect_db()
        if not conn:
            sys.exit(1)
        ensure_source_format_column(conn)

    print(f'\n找到 {len(flights)} 次飛行任務')
    print('-' * 60)

    grand_total = grand_valid = grand_invalid = 0

    for idx, (flight_id, files) in enumerate(flights.items(), 1):
        kinds = '+'.join(m['meas_type'] for _, m in files)
        level = files[0][1]['level']
        print(f'  [{idx}/{len(flights)}] {flight_id} ({level} {kinds}) ...', end=' ', flush=True)

        total, valid, invalid = import_flight(conn, flight_id, files, args.dry_run)
        grand_total   += total
        grand_valid   += valid
        grand_invalid += invalid
        print(f'解析 {total:,} 列  (有效:{valid:,} 無效:{invalid:,})')

    if conn:
        conn.close()

    print('\n' + '=' * 60)
    print('解析完成（dry-run，未寫入）' if args.dry_run else '匯入完成')
    print('=' * 60)
    print(f'解析總列數: {grand_total:,}')
    if grand_total:
        print(f'有效    : {grand_valid:,}  ({grand_valid / grand_total * 100:.1f}%)')
    print(f'無效    : {grand_invalid:,}')
    print('=' * 60)
    print('\n驗證指令：')
    print('  docker exec -it taoyuan-air-db psql -U taoyuan_user -d taoyuan_air')
    print('  SELECT COUNT(*) FROM uav_flights;')
    print('  SELECT COUNT(*) FROM uav_data;')
    print('  SELECT * FROM check_uav_data_quality();')


if __name__ == '__main__':
    main()