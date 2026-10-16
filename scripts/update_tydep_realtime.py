#!/usr/bin/env python3
"""
TYDEP（桃園市環保局）即時小時值入庫腳本。

流程：
  環保局 SFTP 上傳 CSV → /data/sftp_tydep/upload/
    → auto_move_watcher（TYDEP 版）搬到 data/raw/tydep-stations/realtime/
    → 本腳本（每小時排程）匯入 tydep_hourly_data，source = 'realtime'
    → 匯入成功的檔案歸檔到 realtime/imported/YYYY/MM/，失敗的移到 realtime/failed/

設計原則（比照 update_moe_realtime.py）：
  - 即時資料只補進資料庫，不覆蓋 source='history' 的歷史資料
  - 同一筆 realtime 重傳時覆蓋舊值（環保局修正資料後重傳）
  - 分區沿用 import_tydep_stations.py 的 ensure_tydep_partitions
  - concentration 保留原始字串（如 '6.4*'、'無資料'），方便事後區分無效原因

CSV 格式（暫定，沿用環保局提供之 Excel 欄位；實際格式確認後調整 COLUMN_ALIASES 即可）：
  日期&時間,測站,NO2,SO2,CO,O3,PM2.5,PM10[,其他欄位會略過]
  2026-10-13 13:00,(局)新興國小,6.7,1.7,0.54,34.9,12,25

用法：
  python scripts/update_tydep_realtime.py
  python scripts/update_tydep_realtime.py --dir /path/to/realtime --dry-run
"""

import argparse
import csv
import io
import math
import os
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(Path(__file__).parent))

from import_tydep_stations import (  # noqa: E402
    POLLUTANT_MAP,
    connect_db,
    ensure_tydep_partitions,
)
from convert_tydep_xlsx import STATION_MAP  # noqa: E402

try:
    from psycopg2.extras import execute_batch
except ImportError:
    print('[ERROR] 請先安裝 psycopg2：pip3 install psycopg2-binary')
    sys.exit(1)


REALTIME_DIR = ROOT_DIR / 'data' / 'raw' / 'tydep-stations' / 'realtime'

# 欄位別名（小寫比對）→ 內部代碼
COLUMN_ALIASES = {
    'datetime': {'日期&時間', '日期時間', '監測時間', 'monitor_date', 'datetime', 'date/time', 'time'},
    'station':  {'測站', '測站名稱', '測站代碼', 'station', 'station_id', 'sitename', 'siteid'},
    'so2':      {'so2'},
    'co':       {'co'},
    'o3':       {'o3'},
    'no2':      {'no2'},
    'pm10':     {'pm10'},
    'pm25':     {'pm2.5', 'pm25', 'pm2_5'},
}

TIME_FORMATS = (
    '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M',
    '%Y/%m/%d %H:%M:%S', '%Y/%m/%d %H:%M',
    '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M',
    '%Y%m%d%H',
)

UPSERT_SQL = """
    INSERT INTO tydep_hourly_data
        (station_id, monitor_date, pollutant_id, pollutant_name,
         pollutant_eng_name, unit, concentration, concentration_numeric,
         data_quality, period_start, period_end, source)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'realtime')
    ON CONFLICT (station_id, monitor_date, pollutant_id)
    DO UPDATE SET
        concentration         = EXCLUDED.concentration,
        concentration_numeric = EXCLUDED.concentration_numeric,
        data_quality          = EXCLUDED.data_quality,
        period_start          = EXCLUDED.period_start,
        period_end            = EXCLUDED.period_end,
        source                = 'realtime',
        created_at            = NOW()
    WHERE tydep_hourly_data.source = 'realtime'
"""


def build_station_lookup() -> dict:
    """測站名稱／代碼 → station_id。接受 '(局)新興國小'、'新興國小'、'0604616A0002'。"""
    lookup = {}
    for raw_name, info in STATION_MAP.items():
        for key in (raw_name, raw_name.replace('(局)', ''), info['name'], info['id']):
            lookup[key.strip()] = info['id']
    return lookup


STATION_LOOKUP = build_station_lookup()


def read_csv_text(path: Path) -> str:
    """環保局檔案可能是 UTF-8（含 BOM）或 Big5，依序嘗試。"""
    raw = path.read_bytes()
    for encoding in ('utf-8-sig', 'cp950'):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError('無法辨識檔案編碼（非 UTF-8 / Big5）')


def map_columns(fieldnames: list) -> dict:
    """把 CSV 表頭對應到內部代碼，回傳 {內部代碼: 原始欄名}。"""
    mapping = {}
    for name in fieldnames or []:
        key = (name or '').strip().lower()
        for code, aliases in COLUMN_ALIASES.items():
            if key in {a.lower() for a in aliases} and code not in mapping:
                mapping[code] = name
    return mapping


def parse_time(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).strip()
    for fmt in TIME_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def parse_number(value: Optional[str]) -> Optional[float]:
    """只有純數字才算有效；'6.4*'、'無資料'、'(空白)'、NaN 等一律為 None。"""
    if value is None:
        return None
    try:
        number = float(str(value).strip())
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def parse_file(path: Path) -> tuple[list, list]:
    """解析單一 CSV，回傳 (rows, warnings)。"""
    text = read_csv_text(path)
    if not text.strip():
        raise ValueError('檔案是空的')
    reader = csv.DictReader(io.StringIO(text))
    columns = map_columns(reader.fieldnames)

    missing = [c for c in ('datetime', 'station') if c not in columns]
    if missing:
        raise ValueError(f'缺少必要欄位：{", ".join(missing)}（表頭：{reader.fieldnames}）')
    if not any(code in columns for code in POLLUTANT_MAP):
        raise ValueError(f'找不到任何污染物欄位（表頭：{reader.fieldnames}）')

    rows, warnings = [], []
    for line_no, record in enumerate(reader, start=2):
        monitor_date = parse_time(record.get(columns['datetime']))
        if monitor_date is None:
            warnings.append(f'第 {line_no} 列時間無法解析：{record.get(columns["datetime"])!r}')
            continue

        station_raw = (record.get(columns['station']) or '').strip()
        station_id = STATION_LOOKUP.get(station_raw)
        if not station_id:
            warnings.append(f'第 {line_no} 列未知測站：{station_raw!r}')
            continue

        for code, meta in POLLUTANT_MAP.items():
            if code not in columns:
                continue
            raw_text = (record.get(columns[code]) or '').strip()
            numeric = parse_number(raw_text)
            rows.append((
                station_id,
                monitor_date,
                meta['id'],
                meta['name'],
                meta['eng'],
                meta['unit'],
                raw_text or 'x',
                numeric,
                'good' if numeric is not None else 'invalid',
                monitor_date,
                monitor_date + timedelta(minutes=59),
            ))

    return rows, warnings


def archive(path: Path, base_dir: Path, ok: bool, note: str = '') -> Path:
    """匯入成功 → imported/YYYY/MM/；失敗 → failed/（附 .err 說明）。同名檔加時間戳避免覆蓋。"""
    if ok:
        target_dir = base_dir / 'imported' / datetime.now().strftime('%Y') / datetime.now().strftime('%m')
    else:
        target_dir = base_dir / 'failed'
    target_dir.mkdir(parents=True, exist_ok=True)

    target = target_dir / path.name
    if target.exists():
        target = target_dir / f'{path.stem}_{datetime.now():%Y%m%d%H%M%S}{path.suffix}'
    shutil.move(str(path), str(target))

    if not ok and note:
        target.with_suffix(target.suffix + '.err').write_text(note, encoding='utf-8')
    return target


def main():
    parser = argparse.ArgumentParser(description='TYDEP 即時 CSV → tydep_hourly_data（source=realtime）')
    parser.add_argument('--dir', type=Path,
                        default=Path(os.getenv('TYDEP_REALTIME_DIR', str(REALTIME_DIR))),
                        help='待匯入資料夾（預設 data/raw/tydep-stations/realtime）')
    parser.add_argument('--dry-run', action='store_true', help='只解析不寫入、不搬檔')
    args = parser.parse_args()

    print('=' * 60)
    print('TYDEP 即時資料入庫工具')
    print('=' * 60)

    base_dir = args.dir
    if not base_dir.exists():
        print(f'[INFO] 資料夾不存在，略過：{base_dir}')
        return

    csv_files = sorted(p for p in base_dir.iterdir() if p.is_file() and p.suffix.lower() == '.csv')
    if not csv_files:
        print(f'[INFO] 沒有待匯入的 CSV：{base_dir}')
        return

    conn = None if args.dry_run else connect_db()
    if not args.dry_run and not conn:
        sys.exit(1)

    grand_total = grand_valid = failed = 0
    try:
        for path in csv_files:
            print(f'  {path.name} ...', end=' ', flush=True)
            try:
                rows, warnings = parse_file(path)
                if not rows:
                    raise ValueError('沒有可匯入的資料列')

                valid = sum(1 for r in rows if r[8] == 'good')
                if not args.dry_run:
                    ensure_tydep_partitions(conn, [r[1] for r in rows])
                    with conn.cursor() as cursor:
                        execute_batch(cursor, UPSERT_SQL, rows, page_size=500)
                    conn.commit()
                    archive(path, base_dir, ok=True)

                grand_total += len(rows)
                grand_valid += valid
                print(f'{len(rows)} 筆（有效 {valid}，無效 {len(rows) - valid}）')
                for w in warnings:
                    print(f'      [WARN] {w}')

            except Exception as e:
                failed += 1
                if conn:
                    conn.rollback()
                print(f'失敗：{e}')
                if not args.dry_run:
                    archive(path, base_dir, ok=False, note=str(e))
    finally:
        if conn:
            conn.close()

    print('-' * 60)
    print(f'[OK] 完成：{grand_total:,} 筆（有效 {grand_valid:,}），失敗檔案 {failed} 個')
    if failed:
        print(f'     失敗檔案已移到 {base_dir / "failed"}，原因見同名 .err 檔')


if __name__ == '__main__':
    main()
