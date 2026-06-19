#!/usr/bin/env python3
"""
TYDEP 測站資料匯入腳本（原 TEPA）
讀取 data/processed/tydep-stations/json/<station_id>/<YYYY_MM>.json
並批次匯入 PostgreSQL 的 tydep_hourly_data 分區表
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

try:
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extras import execute_batch
except ImportError:
    print("[ERROR] 請先安裝 psycopg2：pip3 install psycopg2-binary")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DB_CONFIG = {
    'host':     os.getenv('POSTGRES_HOST',     'localhost'),
    'port':     os.getenv('POSTGRES_PORT',     '5432'),
    'database': os.getenv('POSTGRES_DB',       'taoyuan_air'),
    'user':     os.getenv('POSTGRES_USER',     'taoyuan_user'),
    'password': os.getenv('POSTGRES_PASSWORD'),
}

if not DB_CONFIG['password']:
    print("[ERROR] 缺少 POSTGRES_PASSWORD 環境變數")
    sys.exit(1)

ROOT_DIR        = Path(__file__).parent.parent
JSON_DIR        = ROOT_DIR / 'data' / 'processed' / 'tydep-stations' / 'json'
LEGACY_JSON_DIR = ROOT_DIR / 'data' / 'raw' / 'tydep-stations' / 'json'

POLLUTANT_MAP = {
    'so2':  {'id': '1',  'name': '二氧化硫',   'eng': 'SO2',   'unit': 'ppb'},
    'co':   {'id': '2',  'name': '一氧化碳',   'eng': 'CO',    'unit': 'ppm'},
    'o3':   {'id': '3',  'name': '臭氧',       'eng': 'O3',    'unit': 'ppb'},
    'no2':  {'id': '7',  'name': '二氧化氮',   'eng': 'NO2',   'unit': 'ppb'},
    'pm10': {'id': '4',  'name': '懸浮微粒',   'eng': 'PM10',  'unit': 'ug/m3'},
    'pm25': {'id': '33', 'name': '細懸浮微粒', 'eng': 'PM2.5', 'unit': 'ug/m3'},
}


def connect_db():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print("[OK] 資料庫連線成功")
        return conn
    except Exception as e:
        print(f"[ERROR] 資料庫連線失敗: {e}")
        return None


def parse_concentration(val) -> Optional[float]:
    if val is None:
        return None


def month_bounds(dt: datetime) -> tuple[datetime, datetime]:
    """回傳資料月份分區的起訖時間。"""
    start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


def ensure_tydep_partitions(conn, monitor_dates: list[datetime]) -> None:
    """依資料月份自動建立 tydep_hourly_data 分區。"""
    months = sorted({month_bounds(dt) for dt in monitor_dates if dt is not None})
    if not months:
        return

    with conn.cursor() as cur:
        for start, end in months:
            partition_name = f"tydep_hourly_data_{start:%Y_%m}"
            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {partition}
                    PARTITION OF tydep_hourly_data
                    FOR VALUES FROM (%s) TO (%s)
                    """
                ).format(partition=sql.Identifier(partition_name)),
                (start, end),
            )
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def build_rows(record: dict) -> list:
    monitor_date = datetime.fromisoformat(record['monitor_date'])
    period_start = monitor_date
    period_end   = monitor_date + timedelta(minutes=59)
    station_id   = record['station_id']
    rows = []

    for key, meta in POLLUTANT_MAP.items():
        raw_val = record['pollutants'].get(key)
        conc_numeric = parse_concentration(raw_val)
        conc_str = str(raw_val) if raw_val is not None else 'x'
        quality  = 'good' if conc_numeric is not None else 'invalid'

        rows.append((
            station_id,
            monitor_date,
            meta['id'],
            meta['name'],
            meta['eng'],
            meta['unit'],
            conc_str,
            conc_numeric,
            quality,
            period_start,
            period_end,
            'history',
        ))

    return rows


def import_json_file(conn, json_path: Path) -> tuple:
    with open(json_path, encoding='utf-8') as f:
        data = json.load(f)

    records = data.get('records', [])
    if not records:
        return 0, 0, 0, 0

    all_rows = []
    skipped  = 0

    for rec in records:
        try:
            all_rows.extend(build_rows(rec))
        except Exception:
            skipped += 1

    valid   = sum(1 for r in all_rows if r[8] == 'good')
    invalid = sum(1 for r in all_rows if r[8] == 'invalid')

    insert_sql = """
        INSERT INTO tydep_hourly_data
            (station_id, monitor_date, pollutant_id, pollutant_name,
             pollutant_eng_name, unit, concentration, concentration_numeric,
             data_quality, period_start, period_end, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (station_id, monitor_date, pollutant_id) DO NOTHING
    """

    cursor = None
    try:
        ensure_tydep_partitions(conn, [row[1] for row in all_rows])
        cursor = conn.cursor()
        execute_batch(cursor, insert_sql, all_rows, page_size=1000)
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"    [ERROR] 匯入失敗: {e}")
        return 0, 0, 0, skipped
    finally:
        if cursor:
            cursor.close()

    return len(all_rows), valid, invalid, skipped


def main():
    print("=" * 60)
    print("TYDEP 測站資料匯入工具")
    print("=" * 60)

    json_dir = JSON_DIR if JSON_DIR.exists() else LEGACY_JSON_DIR

    if not json_dir.exists():
        print(f"[ERROR] 找不到 TYDEP JSON 目錄：{JSON_DIR}")
        sys.exit(1)

    conn = connect_db()
    if not conn:
        sys.exit(1)

    print(f"JSON 來源目錄：{json_dir}")

    station_dirs = sorted([d for d in json_dir.iterdir() if d.is_dir()])
    if not station_dirs:
        print("[ERROR] 找不到任何測站目錄")
        conn.close()
        sys.exit(1)

    grand_total = grand_valid = grand_invalid = grand_skipped = 0

    for station_dir in station_dirs:
        station_id = station_dir.name
        json_files = sorted(station_dir.glob('*.json'))
        print(f"\n[測站] {station_id}  ({len(json_files)} 個月份檔案)")
        print("-" * 60)
        st_total = st_valid = st_invalid = 0

        for idx, jf in enumerate(json_files, 1):
            total, valid, invalid, skipped = import_json_file(conn, jf)
            st_total   += total
            st_valid   += valid
            st_invalid += invalid
            print(f"  [{idx:3d}/{len(json_files)}] {jf.name}  "
                  f"→ {total:5d} 列  (有效:{valid} 無效:{invalid})"
                  + (f"  跳過:{skipped}" if skipped else ""))

        print(f"  小計：{st_total:,} 列  有效:{st_valid:,}  無效:{st_invalid:,}")
        grand_total   += st_total
        grand_valid   += st_valid
        grand_invalid += st_invalid

    conn.close()

    print("\n" + "=" * 60)
    print("匯入完成")
    print("=" * 60)
    print(f"總列數  : {grand_total:,}")
    print(f"有效    : {grand_valid:,}  ({grand_valid/grand_total*100:.1f}%)" if grand_total else "有效: 0")
    print(f"無效    : {grand_invalid:,}")
    print("=" * 60)
    print("\n驗證指令：")
    print("  docker exec -it taoyuan-air-db psql -U taoyuan_user -d taoyuan_air")
    print("  SELECT COUNT(*) FROM tydep_hourly_data;")
    print("  SELECT * FROM check_tydep_data_quality();")


if __name__ == '__main__':
    main()
