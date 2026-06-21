#!/usr/bin/env python3
"""
UAV 資料匯入腳本
直接讀取 data/raw/UAV/<YYYYMMDD_TTTT>_L3_ascending(_sitename).txt
並批次匯入 PostgreSQL 的 uav_data 分區表

檔名格式：YYYYMMDD_TTTT_L3_ascending(_sitename).txt
flight_id：YYYYMMDD_TTTT（取前兩段）
takeoff_time：YYYYMMDD_TTTT（當地時間）

txt 格式：
  第 1 行：單位（如 (m), (hPa), ...）
  第 2 行：欄位名稱（agl, asl, P, T, ...）
  第 3 行起：資料（NaN 存為 NULL）

注意：agl 欄位作為層鍵（agl_m），不另外插入 uav_data 作為參數
"""

import os
import sys
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

DEFAULT_METADATA = {
    'data_release_date': '2026-04-17',
    'project_name': '桃園環保局',
    'instrument': 'Aeromount V2(A009)+POM(1781)',
    'latitude': 25.0605,
    'longitude': 121.1287,
    'ground_altitude_m': 17.0,
    'highest_flight_altitude_m': 301.0,
    'average_ascent_rate_ms': 2.8,
}

# ── 量測參數欄位（不含 agl，agl 單獨作為層鍵 agl_m）────────────────────────
# CO2 為預留欄位；原始檔若有 CO2 就匯入，若沒有則不阻擋匯入。
PARAM_COLS = [
    'asl', 'P', 'T', 'RH', 'PM1', 'PM2.5', 'PM10',
    'ws', 'wd', 'theta', 'Td', 'q', 'mixR', 'Tv', 'thetav',
    'O3', 'CO', 'CO2', 'SO2', 'NO2', 'NH3', 'H2S', 'TVOC',
]

OPTIONAL_PARAM_COLS = {'CO2'}
MEASUREMENT_PARAM_COLS = [param_id for param_id in PARAM_COLS if param_id != 'asl']

HEADER_ALIASES = {
    'PM25': 'PM2.5',
}

MAX_AGL_M = 3000.0

INSERT_SQL = """
    INSERT INTO uav_data
        (flight_id, agl_m, parameter_id, raw_value, value, data_quality)
    VALUES (%s, %s, %s, %s, %s, %s)
    ON CONFLICT (flight_id, agl_m, parameter_id) DO NOTHING
"""


def connect_db():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print('[OK] 資料庫連線成功')
        return conn
    except Exception as e:
        print(f'[ERROR] 資料庫連線失敗: {e}')
        return None


def ensure_uav_flight_and_partition(
    conn,
    flight_id: str,
    takeoff_time: datetime,
    data_level: str,
    flight_direction: str,
    site_name: str,
) -> None:
    """自動補齊飛行任務基本資料與 flight_id LIST 分區。"""
    partition_name = f"uav_data_{flight_id}"
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO uav_flights
                (flight_id, takeoff_time, flight_direction, data_level, data_release_date,
                 project_name, instrument, site_name, location, latitude, longitude,
                 ground_altitude_m, highest_flight_altitude_m, average_ascent_rate_ms)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                    %s, %s, %s, %s, %s)
            ON CONFLICT (flight_id) DO UPDATE SET
                takeoff_time              = EXCLUDED.takeoff_time,
                flight_direction          = EXCLUDED.flight_direction,
                data_level                = EXCLUDED.data_level,
                data_release_date         = EXCLUDED.data_release_date,
                project_name              = EXCLUDED.project_name,
                instrument                = EXCLUDED.instrument,
                site_name                 = EXCLUDED.site_name,
                location                  = EXCLUDED.location,
                latitude                  = EXCLUDED.latitude,
                longitude                 = EXCLUDED.longitude,
                ground_altitude_m         = EXCLUDED.ground_altitude_m,
                highest_flight_altitude_m = EXCLUDED.highest_flight_altitude_m,
                average_ascent_rate_ms    = EXCLUDED.average_ascent_rate_ms,
                updated_at                = NOW()
            """,
            (
                flight_id,
                takeoff_time,
                flight_direction,
                data_level,
                DEFAULT_METADATA['data_release_date'],
                DEFAULT_METADATA['project_name'],
                DEFAULT_METADATA['instrument'],
                site_name,
                DEFAULT_METADATA['longitude'],
                DEFAULT_METADATA['latitude'],
                DEFAULT_METADATA['latitude'],
                DEFAULT_METADATA['longitude'],
                DEFAULT_METADATA['ground_altitude_m'],
                DEFAULT_METADATA['highest_flight_altitude_m'],
                DEFAULT_METADATA['average_ascent_rate_ms'],
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
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'    [ERROR] UAV 分區建立失敗: {e}')
        raise
    finally:
        if cursor:
            cursor.close()


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


def parse_txt_file(filepath: Path, flight_id: str):
    """
    解析單一 txt 檔，yield INSERT tuple。
    - lines[0]：單位行（跳過）
    - lines[1]：欄位名稱行
    - lines[2:]：資料行

    分隔符優先嘗試逗號，若欄位數不符則改用空白分隔。
    L3 檔案為 3 km 以下資料；若高度超過 3 km 則跳過。
    agl 只作為 agl_m 層鍵，不插入 uav_data。
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    if len(lines) < 3:
        return

    # 自動偵測分隔符
    header_line = lines[1].strip()
    if ',' in header_line:
        sep = ','
    else:
        sep = None  # str.split() 預設以空白分隔

    col_names = [
        HEADER_ALIASES.get(column.strip(), column.strip())
        for column in header_line.split(sep)
    ]

    for line in lines[2:]:
        line = line.strip()
        if not line:
            continue

        values = [v.strip() for v in line.split(sep)]
        if len(values) < len(col_names):
            continue

        row = dict(zip(col_names, values))

        # 解析 agl 作為層鍵
        try:
            agl_m = float(row.get('agl', '').strip())
        except (ValueError, TypeError):
            continue

        # L3 檔案定義為 3 km 以下資料，超過時跳過。
        if agl_m > MAX_AGL_M:
            continue

        # L3 會在實際最高觀測高度以上以 NaN 補到 3 km。
        # 若某高度層所有量測欄位都無有效值，視為進入補值區並停止讀取該檔。
        if not row_has_any_valid_measurement(row):
            break

        # 插入各參數（不含 agl）
        for param_id in PARAM_COLS:
            if param_id not in row:
                continue
            raw_val = row.get(param_id, '').strip()
            raw_value, value, quality = parse_value(raw_val)

            yield (
                flight_id,
                agl_m,
                param_id,
                raw_value,
                value,
                quality,
            )


def import_txt_file(conn, filepath: Path) -> tuple:
    """匯入單一 txt 檔，回傳 (total, valid, invalid)。"""
    # 從檔名解析：YYYYMMDD_TTTT_L3_ascending(_sitename).txt
    parts     = filepath.stem.split('_')
    if len(parts) < 4:
        print(f'    [ERROR] 檔名格式不符：{filepath.name}')
        return 0, 0, 0

    flight_id = f'{parts[0]}_{parts[1]}'
    data_level = parts[2]
    flight_direction = parts[3]
    site_name = parts[4] if len(parts) > 4 else 'Guanyin'

    try:
        takeoff_time = datetime.strptime(flight_id, '%Y%m%d_%H%M')
    except ValueError:
        print(f'    [ERROR] 檔名時間格式不符：{filepath.name}')
        return 0, 0, 0

    rows    = list(parse_txt_file(filepath, flight_id))
    valid   = sum(1 for r in rows if r[5] == 'good')
    invalid = len(rows) - valid

    if not rows:
        return 0, 0, 0

    cursor = None
    try:
        ensure_uav_flight_and_partition(
            conn,
            flight_id,
            takeoff_time,
            data_level,
            flight_direction,
            site_name,
        )
        cursor = conn.cursor()
        execute_batch(cursor, INSERT_SQL, rows, page_size=2000)
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
    print('UAV 資料匯入工具')
    print('=' * 60)

    txt_files = sorted(RAW_DIR.glob('*_L3_ascending*.txt'))
    if not txt_files:
        print(f'[ERROR] 找不到 txt 檔案：{RAW_DIR}')
        sys.exit(1)

    conn = connect_db()
    if not conn:
        sys.exit(1)

    print(f'\n找到 {len(txt_files)} 個飛行任務檔案')
    print('-' * 60)

    grand_total = grand_valid = grand_invalid = 0

    for idx, txt_path in enumerate(txt_files, 1):
        parts     = txt_path.stem.split('_')
        flight_id = f'{parts[0]}_{parts[1]}'
        print(f'  [{idx}/{len(txt_files)}] {flight_id} ...', end=' ', flush=True)

        total, valid, invalid = import_txt_file(conn, txt_path)
        grand_total   += total
        grand_valid   += valid
        grand_invalid += invalid
        print(f'{total:,} 列  (有效:{valid:,} 無效:{invalid:,})')

    conn.close()

    print('\n' + '=' * 60)
    print('匯入完成')
    print('=' * 60)
    print(f'總列數  : {grand_total:,}')
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
