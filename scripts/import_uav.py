#!/usr/bin/env python3
"""
UAV 資料匯入腳本：讀取無人機垂直剖面 txt，匯入 PostgreSQL 的 uav_data

支援檔名（格式說明見 data/DATA_GUIDE.md）：
  新：UAV_L2_{gas|met}_20260330_1647_AMV4_Guanyin_V1.txt（gas、met 合併為同一趟飛行）
  舊：UAV_V1_L3_gas_20260330_1647_Aeromount(V4)_Guanyin.txt
同一趟飛行新舊並存時只用新格式；重匯時整趟飛行重寫。

用法：
  python scripts/import_uav.py                                      # 讀 data/raw/UAV
  python scripts/import_uav.py --raw-dir /data/sftp_root/uploads/UAV
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
ROOT_DIR = Path(__file__).parent.parent
RAW_DIR  = ROOT_DIR / 'data' / 'raw' / 'UAV'

# 新：UAV_L2_gas_20260330_1647_AMV4_Guanyin_V1.txt
NEW_FILENAME_PATTERN = re.compile(
    r'^UAV_L(?P<level>\d+)_(?P<meas_type>[A-Za-z]+)_(?P<date>\d{8})_(?P<time>\d{4})_'
    r'(?P<instrument>.+?)_(?P<site>[A-Za-z]+)_V(?P<version>\d+)\.txt$',
    re.IGNORECASE,
)
# 舊：UAV_V1_L3_gas_20260330_0025_Aeromount(V4)_Guanyin.txt
OLD_FILENAME_PATTERN = re.compile(
    r'^UAV_V(?P<version>\d+)_L(?P<level>\d+)_(?P<meas_type>[A-Za-z]+)_(?P<date>\d{8})_'
    r'(?P<time>\d{4})_(?P<instrument>.+)_(?P<site>[A-Za-z]+)\.txt$',
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
}

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
    解析 UAV 檔名，回傳 metadata dict 或 None。

    範例：UAV_L2_gas_20260330_1647_AMV4_Guanyin_V1.txt
    → {'format': 'new', 'level': 'L2', 'level_num': 2, 'meas_type': 'gas',
       'date': '20260330', 'time': '1647', 'instrument': 'AMV4',
       'site': 'Guanyin', 'version': '1', 'flight_id': '20260330_1647'}
    """
    for fmt, pattern in (('new', NEW_FILENAME_PATTERN), ('old', OLD_FILENAME_PATTERN)):
        m = pattern.match(filename)
        if m:
            return {
                'format':     fmt,
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
    return None


def find_flight_files(raw_dir: Path) -> dict:
    """
    遞迴搜尋 raw_dir，依 flight_id 分組，並挑出每趟飛行要使用的檔案：
      1. 有新格式就只用新格式
      2. 同格式取最高資料級別
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
        fmt = 'new' if any(m['format'] == 'new' for _, m in items) else 'old'
        items = [(p, m) for p, m in items if m['format'] == fmt]
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
    data_start_index 指向分隔線 '==' 之後的下一行（即單位行）；
    若沒有分隔線（最早期格式），回傳 0。
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
    """依序嘗試多個 key（新舊檔頭命名不同），回傳第一個有值的。"""
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


def parse_value(raw: str) -> tuple:
    """
    解析單一欄位值。
    回傳 (raw_value, value, data_quality)
    NaN → (raw, None, 'invalid')
    """
    val_str = str(raw).strip()
    if val_str.lower() == 'nan':
        return (val_str, None, 'invalid')
    try:
        return (val_str, round(float(val_str), 4), 'good')
    except (ValueError, TypeError):
        return (val_str, None, 'invalid')


def row_has_any_valid_measurement(row: dict) -> bool:
    """排除高度欄位，判斷該高度層是否還有任一有效量測值。"""
    for param_id in MEASUREMENT_PARAM_COLS:
        if param_id not in row:
            continue
        _, value, quality = parse_value(row.get(param_id, ''))
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
    max_agl = meta_number(file_meta, 'max_agl', 'max_agl_m')
    values = {}

    data_lines = lines[data_start:]
    if len(data_lines) < 3:
        return file_meta, values

    # data_lines[0] = 單位行（跳過）；data_lines[1] = 欄位名稱行；data_lines[2:] = 資料行
    col_names = [
        HEADER_ALIASES.get(column.strip(), column.strip())
        for column in data_lines[1].strip().split(',')
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
        if not row_has_any_valid_measurement(row):
            continue

        for param_id in PARAM_COLS:
            if param_id in row:
                values[(agl_m, param_id)] = parse_value(row[param_id])

    return file_meta, values


def merge_flight(files: list) -> tuple[dict, dict]:
    """
    合併同一趟飛行的多個檔案（新版 gas＋met）。
    檔頭以第一個檔為主、後面的補空缺；量測值重複（如兩檔都有 asl）時保留有效值。
    """
    merged_meta, merged_values = {}, {}
    for path, _ in files:
        file_meta, values = parse_txt_file(path)
        for key, val in file_meta.items():
            merged_meta.setdefault(key, val)
        for key, val in values.items():
            if key not in merged_values or (merged_values[key][2] != 'good' and val[2] == 'good'):
                merged_values[key] = val
    return merged_meta, merged_values


# ── 寫入資料庫 ────────────────────────────────────────────────────────────────
def upsert_flight(conn, flight_id: str, fname_meta: dict, file_meta: dict) -> None:
    """寫入／更新飛行任務基本資料，並確保 flight_id LIST 分區存在。"""
    partition_name = f"uav_data_{flight_id}"

    takeoff_time = datetime.strptime(flight_id, '%Y%m%d_%H%M')
    data_release_date = (
        parse_meta_date(meta_get(file_meta, 'data_release_date'))
        or takeoff_time.strftime('%Y-%m-%d')
    )

    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO uav_flights
                (flight_id, flight_direction, takeoff_time, data_release_date, data_level,
                 site_name, latitude, longitude, altitude_m, instrument, max_agl_m)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                fname_meta['instrument'],
                meta_number(file_meta, 'max_agl', 'max_agl_m'),
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


def import_flight(conn, flight_id: str, files: list) -> tuple:
    """匯入一趟飛行（可能由多個檔案組成），回傳 (total, valid, invalid)。"""
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

    try:
        upsert_flight(conn, flight_id, fname_meta, file_meta)
        with conn.cursor() as cursor:
            # 先清掉該飛行舊資料（例如舊版 L3），避免殘留舊高度層或舊值
            cursor.execute("DELETE FROM uav_data WHERE flight_id = %s", (flight_id,))
            execute_batch(cursor, INSERT_SQL, rows, page_size=2000)
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'    [ERROR] 匯入失敗: {e}')
        return 0, 0, 0

    return len(rows), valid, invalid


def main():
    parser = argparse.ArgumentParser(description='UAV txt → PostgreSQL')
    parser.add_argument('--raw-dir', type=Path,
                        default=Path(os.getenv('UAV_RAW_DIR', str(RAW_DIR))),
                        help='資料夾（預設 data/raw/UAV，可設環境變數 UAV_RAW_DIR；會遞迴搜尋）')
    args = parser.parse_args()

    print('=' * 60)
    print('UAV 資料匯入工具')
    print('=' * 60)

    flights = find_flight_files(args.raw_dir)
    if not flights:
        print(f'[INFO] 沒有可匯入的 txt 檔案：{args.raw_dir}')
        return

    conn = connect_db()
    if not conn:
        sys.exit(1)

    print(f'\n找到 {len(flights)} 次飛行任務')
    print('-' * 60)

    grand_total = grand_valid = grand_invalid = 0

    for idx, (flight_id, files) in enumerate(flights.items(), 1):
        kinds = '+'.join(m['meas_type'] for _, m in files)
        level = files[0][1]['level']
        print(f'  [{idx}/{len(flights)}] {flight_id} ({level} {kinds}) ...', end=' ', flush=True)

        total, valid, invalid = import_flight(conn, flight_id, files)
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
    print('  SELECT COUNT(*) FROM uav_flights;')
    print('  SELECT COUNT(*) FROM uav_data;')
    print('  SELECT * FROM check_uav_data_quality();')


if __name__ == '__main__':
    main()
