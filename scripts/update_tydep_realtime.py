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

環保局即時 CSV 格式（2026-11 實際檔案）：
  檔名：TYDEP_<測站代號>_<YYYYMMDDHH>.csv，例如 TYDEP_Xinxing_2026111113.csv
  第 1 列：欄位名稱，前兩欄空白（時間、測站）
  第 2 列：單位
  第 3 列起：資料
    ,,PM2.5,PM10,O3,SO2,NO2,NO,NOx,CO,THC,CH4,NMHC,WIND_SPEED,WIND_ANGLE,AMB_TEMP,RH
    ,,μg/m3,μg/m3,ppb,ppb,ppb,ppb,ppb,ppm,ppm,ppm,ppm,m/sec,deg,℃,%
    2026/11/11 13:00,(局)新興國小,13.0,32.0,54.3,...
  空品站（(局)開頭 4 站）有 15 個項目，氣象站（國小、污水廠 4 站）只有風速、風向、溫度、濕度。
  也相容舊的暫定格式（表頭有「日期&時間」「測站」）。

測站判斷：先看檔名的測站代號，對不到再看 CSV 裡的測站名稱。
時間：monitor_date 直接取 CSV 時間，視為該小時的開始（13:00 → 13:00–13:59）。
     若環保局確認是「時段結束」，把 TIME_IS_PERIOD_END 改成 True。

用法：
  python scripts/update_tydep_realtime.py
  python scripts/update_tydep_realtime.py --dir /path/to/realtime --dry-run
"""

import argparse
import csv
import io
import math
import os
import re
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(Path(__file__).parent))

from import_tydep_stations import (  # noqa: E402
    PARAMETER_MAP,
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

# 環保局確認時間定義前，先當成時段開始
TIME_IS_PERIOD_END = False

# CSV 欄位名稱（小寫比對）→ 內部代碼（PARAMETER_MAP 的 key）
COLUMN_ALIASES = {
    'datetime':   {'日期&時間', '日期時間', '監測時間', 'monitor_date', 'datetime', 'date/time', 'time'},
    'station':    {'測站', '測站名稱', '測站代碼', 'station', 'station_id', 'sitename', 'siteid'},
    'so2':        {'so2'},
    'co':         {'co'},
    'o3':         {'o3'},
    'pm10':       {'pm10'},
    'nox':        {'nox'},
    'no':         {'no'},
    'no2':        {'no2'},
    'thc':        {'thc'},
    'nmhc':       {'nmhc'},
    'ch4':        {'ch4'},
    'pm25':       {'pm2.5', 'pm25', 'pm2_5'},
    'ws':         {'wind_speed', 'ws', '風速'},
    'wd':         {'wind_angle', 'wind_direc', 'wd', '風向'},
    'at':         {'amb_temp', 'temp', '溫度', '氣溫'},
    'rh':         {'rh', '相對濕度', '濕度'},
}

TIME_FORMATS = (
    '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M',
    '%Y/%m/%d %H:%M:%S', '%Y/%m/%d %H:%M',
    '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M',
    '%Y%m%d%H',
)

FILENAME_PATTERN = re.compile(r'^TYDEP_(?P<code>[A-Za-z0-9]+)_(?P<ts>\d{10})$')

UPSERT_SQL = """
    INSERT INTO tydep_hourly_data
        (station_id, monitor_date, parameter_id, parameter_name,
         parameter_eng_name, unit, concentration, concentration_numeric,
         data_quality, period_start, period_end, source)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'realtime')
    ON CONFLICT (station_id, monitor_date, parameter_id)
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


STATION_IDS = {info['id'] for info in STATION_MAP.values()}


def build_station_lookup() -> dict:
    """測站名稱／代碼 → station_id。接受 '(局)新興國小'、'新興國小'、'TYDEP_Xinxing'。"""
    lookup = {}
    for raw_name, info in STATION_MAP.items():
        for key in (raw_name, raw_name.replace('(局)', ''), info['name'], info['id']):
            lookup[key.strip()] = info['id']
    return lookup


STATION_LOOKUP = build_station_lookup()


def station_from_filename(path: Path) -> Optional[str]:
    """TYDEP_Xinxing_2026111113.csv → TYDEP_Xinxing（資料庫有這個測站才回傳）。"""
    match = FILENAME_PATTERN.match(path.stem)
    if not match:
        return None
    station_id = f"TYDEP_{match.group('code')}"
    return station_id if station_id in STATION_IDS else None


def read_csv_text(path: Path) -> str:
    """環保局檔案可能是 UTF-8（含 BOM）或 Big5，依序嘗試。"""
    raw = path.read_bytes()
    for encoding in ('utf-8-sig', 'cp950'):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError('無法辨識檔案編碼（非 UTF-8 / Big5）')


def map_columns(header: list) -> dict:
    """把表頭對應到內部代碼，回傳 {內部代碼: 欄位位置}。

    環保局格式的前兩欄沒有名稱，固定當成「時間」「測站」。
    """
    mapping = {}
    for idx, name in enumerate(header):
        key = (name or '').strip().lower()
        if not key:
            if idx == 0:
                mapping.setdefault('datetime', idx)
            elif idx == 1:
                mapping.setdefault('station', idx)
            continue
        for code, aliases in COLUMN_ALIASES.items():
            if key in {a.lower() for a in aliases} and code not in mapping:
                mapping[code] = idx
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
    lines = list(csv.reader(io.StringIO(text)))
    header, body = lines[0], lines[1:]
    columns = map_columns(header)

    missing = [c for c in ('datetime', 'station') if c not in columns]
    if missing:
        raise ValueError(f'缺少必要欄位：{", ".join(missing)}（表頭：{header}）')
    params = [code for code in PARAMETER_MAP if code in columns]
    if not params:
        raise ValueError(f'找不到任何量測項目欄位（表頭：{header}）')

    file_station = station_from_filename(path)
    rows, warnings = [], []
    for line_no, record in enumerate(body, start=2):
        if not any(cell.strip() for cell in record):
            continue                                   # 空白列
        cell = lambda code: record[columns[code]].strip() if columns[code] < len(record) else ''

        raw_time = cell('datetime')
        if not raw_time:
            continue                                   # 單位列（前兩欄空白）
        monitor_date = parse_time(raw_time)
        if monitor_date is None:
            warnings.append(f'第 {line_no} 列時間無法解析：{raw_time!r}')
            continue
        if TIME_IS_PERIOD_END:
            monitor_date -= timedelta(hours=1)

        station_raw = cell('station')
        station_id = file_station or STATION_LOOKUP.get(station_raw)
        if not station_id:
            warnings.append(f'第 {line_no} 列未知測站：{station_raw!r}（檔名 {path.name}）')
            continue
        name_id = STATION_LOOKUP.get(station_raw)
        if file_station and name_id and name_id != file_station:
            warnings.append(f'第 {line_no} 列測站名稱 {station_raw!r} 與檔名 {path.name} 不一致，以檔名為準')

        for code in params:
            meta = PARAMETER_MAP[code]
            raw_text = cell(code)
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
    print('TYDEP 即時資料入庫工具' + ('（dry-run，不寫入、不搬檔）' if args.dry_run else ''))
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
                    raise ValueError('沒有可匯入的資料列' + (f'：{warnings[0]}' if warnings else ''))

                valid = sum(1 for r in rows if r[8] == 'good')
                if not args.dry_run:
                    ensure_tydep_partitions(conn, [r[1] for r in rows])
                    with conn.cursor() as cursor:
                        execute_batch(cursor, UPSERT_SQL, rows, page_size=500)
                    conn.commit()
                    archive(path, base_dir, ok=True)

                grand_total += len(rows)
                grand_valid += valid
                print(f'{rows[0][0]} {rows[0][1]:%Y-%m-%d %H:%M}，{len(rows)} 筆（有效 {valid}，無效 {len(rows) - valid}）')
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
    if failed and not args.dry_run:
        print(f'     失敗檔案已移到 {base_dir / "failed"}，原因見同名 .err 檔')


if __name__ == '__main__':
    main()
