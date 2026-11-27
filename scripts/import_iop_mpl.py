#!/usr/bin/env python3
"""
IOP miniMPL 匯入：讀取 SFTP 上傳的 .nc 檔，匯入 mpl_stations / mpl_profiles。

資料來源（可用環境變數 SFTP_UPLOADS_DIR 覆寫 /data/sftp_root/uploads）：
  /data/sftp_root/uploads/TYDEP/2026IOP1/miniMPL
  /data/sftp_root/uploads/TYDEP/2026IOP2/miniMPL

檔名：MMPL_5009_L1_NRB_20260327_Guanyin_V1.nc
      儀器_儀器序號_資料級別_量測主要參數_觀測年月日(UTC)_測站_反演版本

檔案內容（NETCDF3）：
  Time(time)            一年中的第幾天（小數），86.0 = 3/27 00:00 UTC；小寫 time 是空的，不使用
  range(range)          離儀器距離（km），1000 層
  NRB_Co / NRB_Cr       (time, range)，NaN = 無資料；約一半的時間整列都是 NaN（不存）
  Energy、溫度、背景值   目前檔案內全為 NaN，不存

重匯：匯入前先刪掉同測站、本檔時間範圍（首筆～末筆）內的舊資料，再寫入。

用法（專案根目錄）：
  python3 scripts/import_iop_mpl.py --dry-run
  python3 scripts/import_iop_mpl.py
  python3 scripts/import_iop_mpl.py --iop IOP2
  python3 scripts/import_iop_mpl.py --raw-dir 某資料夾
"""

import argparse
import math
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

try:
    import numpy as np
    import netCDF4
except ImportError:
    print('[ERROR] 請先安裝 netCDF4：python3 -m pip install --user netCDF4')
    sys.exit(1)

try:
    import psycopg2
    from psycopg2.extras import execute_values
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
    'IOP1': SFTP_UPLOADS_DIR / 'TYDEP' / '2026IOP1' / 'miniMPL',
    'IOP2': SFTP_UPLOADS_DIR / 'TYDEP' / '2026IOP2' / 'miniMPL',
}

# ── 資料庫連線設定 ─────────────────────────────────────────────────────────────
DB_CONFIG = {
    'host':     os.getenv('POSTGRES_HOST',     'localhost'),
    'port':     os.getenv('POSTGRES_PORT',     '5432'),
    'database': os.getenv('POSTGRES_DB',       'taoyuan_air'),
    'user':     os.getenv('POSTGRES_USER',     'taoyuan_user'),
    'password': os.getenv('POSTGRES_PASSWORD'),
}

# MMPL_5009_L1_NRB_20260327_Guanyin_V1.nc
FILENAME_PATTERN = re.compile(
    r'^MMPL_(?P<serial>\d+)_L(?P<level>\d+)_(?P<params>[A-Za-z]+)_'
    r'(?P<date>\d{8})_(?P<site>[A-Za-z]+)_V(?P<version>\d+)\.nc$',
    re.IGNORECASE,
)


def parse_filename(name: str) -> Optional[dict]:
    m = FILENAME_PATTERN.match(name)
    if not m:
        return None
    meta = m.groupdict()
    meta['station_id'] = f"MMPL{meta['serial']}_{meta['site']}"
    meta['date_obj'] = datetime.strptime(meta['date'], '%Y%m%d')
    return meta


def find_nc_files(dirs: list[Path]) -> list[Path]:
    files = []
    for d in dirs:
        if d.is_dir():
            files.extend(p for p in d.rglob('*.nc') if parse_filename(p.name))
    return sorted(files, key=lambda p: p.name)


def to_list(arr) -> list:
    """numpy 陣列 → Python list，NaN 換成 None（存成 SQL NULL）。"""
    return [None if math.isnan(v) else round(float(v), 6) for v in arr]


def read_nc(path: Path, meta: dict) -> dict:
    """讀一個 .nc 檔，回傳測站資訊與有效剖面。"""
    with netCDF4.Dataset(path) as ds:
        ds.set_auto_mask(False)
        doy   = ds['Time'][:].astype(np.float64)
        rng   = ds['range'][:].astype(np.float64)
        co    = ds['NRB_Co'][:].astype(np.float64)
        cr    = ds['NRB_Cr'][:].astype(np.float64)
        attrs = {k: ds.getncattr(k) for k in ds.ncattrs()}

    # 檔內的缺值標記 -999.99 也當成 NaN
    co[co < -999] = np.nan
    cr[cr < -999] = np.nan

    # Time 是 float32，精度約 1 秒；換算後四捨五入到秒
    year_start = datetime(meta['date_obj'].year, 1, 1)
    times = [year_start + timedelta(seconds=round((d - 1) * 86400)) for d in doy]

    if times and times[0].date() != meta['date_obj'].date():
        raise ValueError(f"檔內第一筆時間 {times[0]} 與檔名日期 {meta['date']} 不符")

    keep = ~(np.isnan(co).all(axis=1) & np.isnan(cr).all(axis=1))
    rows = [
        (meta['station_id'], times[i], to_list(co[i]), to_list(cr[i]), path.name)
        for i in np.where(keep)[0]
    ]

    def num(key):
        try:
            return float(str(attrs.get(key, '')).split()[0])
        except (ValueError, IndexError):
            return None

    station = {
        'station_id':  meta['station_id'],
        'serial':      meta['serial'],
        'site':        meta['site'],
        'latitude':    num('Latitude'),
        'longitude':   num('Longitude'),
        'elevation_m': num('Elevation'),
        'range_km':    [round(float(v), 4) for v in rng],
    }
    return {'station': station, 'rows': rows, 'total': len(times)}


def upsert_station(cur, st: dict) -> None:
    cur.execute(
        """
        INSERT INTO mpl_stations
            (station_id, serial, site, latitude, longitude, elevation_m, range_km)
        VALUES (%(station_id)s, %(serial)s, %(site)s, %(latitude)s, %(longitude)s,
                %(elevation_m)s, %(range_km)s)
        ON CONFLICT (station_id) DO UPDATE SET
            latitude    = EXCLUDED.latitude,
            longitude   = EXCLUDED.longitude,
            elevation_m = EXCLUDED.elevation_m,
            range_km    = EXCLUDED.range_km,
            updated_at  = NOW()
        """,
        st,
    )


def import_file(conn, path: Path, meta: dict) -> Optional[tuple[int, int, int]]:
    """匯入一個檔，回傳 (時間總數, 寫入列數, 取代舊資料列數)；失敗回傳 None。"""
    try:
        data = read_nc(path, meta)
    except Exception as e:
        print(f'讀檔失敗：{e}')
        return None

    rows = data['rows']
    if not rows:
        print('沒有有效剖面，跳過')
        return data['total'], 0, 0

    t_min, t_max = rows[0][1], rows[-1][1]
    try:
        with conn.cursor() as cur:
            upsert_station(cur, data['station'])
            cur.execute(
                """
                DELETE FROM mpl_profiles
                WHERE station_id = %s AND measure_time BETWEEN %s AND %s
                """,
                (meta['station_id'], t_min, t_max),
            )
            deleted = cur.rowcount
            execute_values(
                cur,
                """
                INSERT INTO mpl_profiles
                    (station_id, measure_time, nrb_co, nrb_cr, source_file)
                VALUES %s
                """,
                rows,
                template='(%s, %s, %s::real[], %s::real[], %s)',
                page_size=200,
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'寫入失敗：{e}')
        return None

    return data['total'], len(rows), deleted


def main():
    ap = argparse.ArgumentParser(description='IOP miniMPL .nc → mpl_profiles')
    ap.add_argument('--raw-dir', type=Path, default=None,
                    help='覆蓋預設資料夾（預設同時掃 2026IOP1/miniMPL 與 2026IOP2/miniMPL）')
    ap.add_argument('--iop', choices=['IOP1', 'IOP2'], default=None,
                    help='只匯入指定 IOP（不填則兩個都匯入）')
    ap.add_argument('--dry-run', action='store_true',
                    help='只讀檔、列出有效剖面數，不寫入資料庫')
    args = ap.parse_args()

    print('=' * 60)
    print('IOP miniMPL 資料匯入工具')
    print('=' * 60)

    if args.raw_dir:
        search_dirs = [args.raw_dir]
    elif args.iop:
        search_dirs = [IOP_DIRS[args.iop]]
    else:
        search_dirs = list(IOP_DIRS.values())

    files = find_nc_files(search_dirs)
    if not files:
        print('[INFO] 找不到符合格式的 .nc 檔')
        for d in search_dirs:
            print(f'       {d}')
        return

    print(f'\n找到 {len(files)} 個 .nc 檔案')
    print('-' * 60)

    conn = None
    if not args.dry_run:
        if not DB_CONFIG['password']:
            print('[ERROR] 未設定 POSTGRES_PASSWORD（請確認 .env）')
            sys.exit(1)
        conn = psycopg2.connect(**DB_CONFIG)
        print('[OK] 資料庫連線成功')

    total_rows = total_deleted = failed = 0
    for i, path in enumerate(files, 1):
        meta = parse_filename(path.name)
        print(f'  [{i}/{len(files)}] {path.name} ...', end=' ', flush=True)

        if args.dry_run:
            try:
                data = read_nc(path, meta)
            except Exception as e:
                print(f'讀檔失敗：{e}')
                failed += 1
                continue
            rows = data['rows']
            span = f"{rows[0][1]:%H:%M}～{rows[-1][1]:%H:%M} UTC" if rows else '-'
            print(f"station={meta['station_id']}  時間 {data['total']} 筆，有效剖面 {len(rows)} 筆（{span}）")
            total_rows += len(rows)
            continue

        result = import_file(conn, path, meta)
        if result is None:
            failed += 1
            continue
        total, written, deleted = result
        msg = f'時間 {total} 筆，寫入 {written} 筆'
        if deleted:
            msg += f'，取代舊資料 {deleted} 筆'
        print(msg)
        total_rows += written
        total_deleted += deleted

    if conn:
        conn.close()

    print('\n' + '=' * 60)
    print('試跑完成（未寫入）' if args.dry_run else '匯入完成')
    print('=' * 60)
    print(f'有效剖面總數：{total_rows:,}')
    if not args.dry_run:
        print(f'取代舊資料  ：{total_deleted:,}')
    print(f'失敗檔案    ：{failed}')
    print('=' * 60)
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
