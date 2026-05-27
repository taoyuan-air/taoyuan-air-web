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
"""

import csv
import os
import sys
from pathlib import Path
from typing import Optional

try:
    import psycopg2
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

# ── txt 欄位名 → parameter_id 對照（agl 單獨處理為 agl_m）────────────────────
# 欄位順序對應 txt 第 2 行
PARAM_COLS = [
    'agl', 'asl', 'P', 'T', 'RH', 'PM1', 'PM25', 'PM10',
    'ws', 'wd', 'theta', 'Td', 'q', 'mixR', 'Tv', 'thetav',
    'O3', 'CO', 'CO2', 'SO2', 'NO2', 'NH3', 'H2S', 'TVOC',
]

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
    跳過第 1 行（單位），第 2 行為欄位名，第 3 行起為資料。
    超過該飛行任務最高有效高度的層直接跳過。
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    if len(lines) < 3:
        return

    col_names   = [c.strip() for c in lines[1].split(',')]
    max_height  = MAX_HEIGHT.get(flight_id, float('inf'))

    for line in lines[2:]:
        values = [v.strip() for v in line.split(',')]
        if len(values) < len(col_names):
            continue

        row = dict(zip(col_names, values))

        try:
            agl_m = float(row.get('agl', '0'))
        except ValueError:
            continue

        # 超過最高有效高度 → 跳過
        if agl_m > max_height:
            continue

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
    parts = filepath.stem.split('_')
    flight_id = f'{parts[0]}_{parts[1]}'

    rows    = list(parse_txt_file(filepath, flight_id))
    valid   = sum(1 for r in rows if r[5] == 'good')
    invalid = len(rows) - valid

    if not rows:
        return 0, 0, 0

    cursor = None
    try:
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
