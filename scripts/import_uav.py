#!/usr/bin/env python3
"""
UAV 資料匯入腳本
直接讀取 data/raw/UAV/<YYYYMMDD_TTTT>_L3_ascending.txt
並批次匯入 PostgreSQL 的 uav_data 分區表

檔名格式：YYYYMMDD_TTTT_L3_ascending.txt
flight_id：YYYYMMDD_TTTT（取前兩段）

txt 格式：
  第 1 行：單位（如 (m), (hPa), ...）
  第 2 行：欄位名稱（agl, asl, P, T, ...）
  第 3 行起：資料（NaN 存為 NULL）

注意：agl 欄位作為層鍵（agl_m），不另外插入 uav_data 作為參數
"""

import os
import sys
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

# ── 量測參數欄位（不含 agl，agl 單獨作為層鍵 agl_m）────────────────────────
# CO2 為本專案必要欄位；若原始檔缺少必要欄位，匯入時直接報錯避免靜默漏資料。
PARAM_COLS = [
    'asl', 'P', 'T', 'RH', 'PM1', 'PM25', 'PM10',
    'ws', 'wd', 'theta', 'Td', 'q', 'mixR', 'Tv', 'thetav',
    'O3', 'CO', 'CO2', 'SO2', 'NO2', 'NH3', 'H2S', 'TVOC',
]

HEADER_ALIASES = {
    'PM2.5': 'PM25',
}

# ── 各飛行任務最高有效高度（超過此高度的層直接跳過）────────────────────────
MAX_HEIGHT = {
    '20260330_0025': 500.0,
    '20260330_0242': 500.0,
    '20260330_1433': 295.0,
    '20260330_1517': 300.0,
    '20260330_1601': 295.0,
    '20260330_1647': 300.0,
}

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
    data_level: str,
    flight_direction: str,
) -> None:
    """自動補齊飛行任務基本資料與 flight_id LIST 分區。"""
    partition_name = f"uav_data_{flight_id}"
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO uav_flights
                (flight_id, flight_direction, data_level, site_name)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (flight_id) DO UPDATE SET
                flight_direction = EXCLUDED.flight_direction,
                data_level       = EXCLUDED.data_level,
                updated_at        = NOW()
            """,
            (flight_id, flight_direction, data_level, 'Guanyin'),
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


def parse_txt_file(filepath: Path, flight_id: str):
    """
    解析單一 txt 檔，yield INSERT tuple。
    - lines[0]：單位行（跳過）
    - lines[1]：欄位名稱行
    - lines[2:]：資料行

    分隔符優先嘗試逗號，若欄位數不符則改用空白分隔。
    超過該飛行任務最高有效高度的層直接跳過。
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

    col_names  = [HEADER_ALIASES.get(c.strip(), c.strip()) for c in header_line.split(sep)]
    max_height = MAX_HEIGHT.get(flight_id, float('inf'))
    missing_params = [param_id for param_id in PARAM_COLS if param_id not in col_names]
    if missing_params:
        raise ValueError(
            f'{filepath.name} 缺少必要欄位: {", ".join(missing_params)}'
        )

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

        # 超過最高有效高度 → 跳過整層
        if agl_m > max_height:
            continue

        # 插入各參數（不含 agl）
        for param_id in PARAM_COLS:
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
    # 從檔名解析 flight_id：YYYYMMDD_TTTT_L3_ascending.txt → YYYYMMDD_TTTT
    parts     = filepath.stem.split('_')
    flight_id = f'{parts[0]}_{parts[1]}'
    data_level = parts[2] if len(parts) > 2 else 'L3'
    flight_direction = parts[3] if len(parts) > 3 else 'ascending'

    rows    = list(parse_txt_file(filepath, flight_id))
    valid   = sum(1 for r in rows if r[5] == 'good')
    invalid = len(rows) - valid

    if not rows:
        return 0, 0, 0

    cursor = None
    try:
        ensure_uav_flight_and_partition(conn, flight_id, data_level, flight_direction)
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

    txt_files = sorted(RAW_DIR.glob('*_L3_ascending.txt'))
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
