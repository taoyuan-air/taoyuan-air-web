#!/usr/bin/env python3
"""
WindLidar TMA_328 資料匯入腳本
直接讀取 data/raw/WindLidar/TMA_328_*.txt 並批次匯入 PostgreSQL

資料規模：每天 766,080 筆（760 層 × 144 時間點 × 7 參數）
資料品質：整列 Hsp=0 → 該時間點所有參數標記為 'invalid'，value=NULL
"""

import csv
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta
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
RAW_DIR  = ROOT_DIR / 'data' / 'raw' / 'WindLidar'

STATION_ID = 'TMA_328'

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

INSERT_SQL = """
    INSERT INTO wind_lidar_data
        (station_id, measure_time, height_m, parameter_id,
         value, raw_value, data_quality, period_start, period_end, source)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (station_id, measure_time, height_m, parameter_id) DO NOTHING
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
        if param_id in INTEGER_PARAMS:
            return float(int(float(raw)))
        return round(float(raw), 3)
    except (ValueError, TypeError):
        return None


def parse_txt_file(filepath: Path):
    """
    解析單一 txt 檔，yield INSERT tuple。
    先按 measure_time 分組判斷整列是否無效，再逐筆 yield。
    """
    # 先讀入全部，按時間分組判斷品質
    time_groups: dict[str, list] = defaultdict(list)

    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            t = row.get('Date/time', '').strip()
            if t:
                time_groups[t].append(row)

    for measure_time_str, rows in time_groups.items():
        try:
            measure_time = datetime.strptime(measure_time_str, '%Y-%m-%d %H:%M')
        except ValueError:
            continue

        period_end   = measure_time
        period_start = measure_time - timedelta(minutes=10)

        # 整列無效：該時間點所有高度的 Hsp 都是 0
        all_hsp_zero = all(
            float(r.get('Hsp', '0') or '0') == 0.0
            for r in rows
        )
        quality = 'invalid' if all_hsp_zero else 'good'

        for row in rows:
            try:
                height_m = float(row['Height'])
            except (ValueError, KeyError):
                continue

            for field_name, param_id in PARAM_MAP.items():
                raw_val = row.get(field_name, '').strip()
                value   = None if quality == 'invalid' else parse_value(raw_val, param_id)

                yield (
                    STATION_ID,
                    measure_time,
                    height_m,
                    param_id,
                    value,
                    raw_val,
                    quality,
                    period_start,
                    period_end,
                    'history',
                )


def import_txt_file(conn, filepath: Path) -> tuple:
    """匯入單一 txt 檔，回傳 (total, valid, invalid)。"""
    rows    = []
    valid   = 0
    invalid = 0

    for row in parse_txt_file(filepath):
        rows.append(row)
        if row[6] == 'good':
            valid += 1
        else:
            invalid += 1

    if not rows:
        return 0, 0, 0

    cursor = None
    try:
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

    txt_files = sorted(RAW_DIR.glob('TMA_328_*.txt'))
    if not txt_files:
        print(f'[ERROR] 找不到 txt 檔案：{RAW_DIR}')
        sys.exit(1)

    conn = connect_db()
    if not conn:
        sys.exit(1)

    print(f'\n找到 {len(txt_files)} 個 txt 檔案')
    print('-' * 60)

    grand_total = grand_valid = grand_invalid = 0

    for idx, txt_path in enumerate(txt_files, 1):
        print(f'  [{idx:2d}/{len(txt_files)}] {txt_path.name} ...', end=' ', flush=True)
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
    print('  SELECT COUNT(*) FROM wind_lidar_data;')
    print('  SELECT * FROM check_wind_lidar_quality();')


if __name__ == '__main__':
    main()
