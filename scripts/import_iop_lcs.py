#!/usr/bin/env python3
"""
IOP 微型感測器（LCS）匯入：讀取 txt，匯入 iop_lcs_samples / iop_lcs_data。

檔名：LCS_AeroboxGas_L2_{測站}_{年}IOP{n}_TYDEPproject.txt
格式：
  - 開頭 # 註解為中繼資料（Device_ID、Site_name、Latitude、Longitude、IOP、
    Missing_value、QC_rejected…）
  - 接著一列欄名（Time PM25 O3 NO2 CO TVOC T RH P），以空白分隔
  - 時間為 ISO8601（2026-03-29T20:00:00），台灣時間
每小時一筆 iop_lcs_samples（整列缺值的小時也會建立，網頁顯示為「—」）；
缺值（預設 -999）不匯入；QC 剔除（預設 -888）存成 flag = 'QC'。

IOP 歸屬：以檔頭 IOP 或檔名的 IOP{n} 為準（2026IOP1 → IOP1）。
重匯同一站（IOP＋測站相同）會先刪掉該站該次 IOP 的舊資料再寫入。

用法（專案根目錄，資料庫要先執行 database/iop_schema.sql、database/iop_lcs_schema.sql）：
  python scripts/import_iop_lcs.py                       # 讀 data/raw/IOP/LCS
  python scripts/import_iop_lcs.py --raw-dir 路徑 --dry-run
"""

import argparse
import os
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    psycopg2 = None

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / '.env')
except ImportError:
    pass

ROOT_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT_DIR / 'data' / 'raw' / 'IOP' / 'LCS'

FILENAME_PATTERN = re.compile(r'^LCS_.*?_(?:\d{4})?IOP(?P<iop>\d+)', re.IGNORECASE)
IOP_PATTERN = re.compile(r'IOP\s*(\d+)', re.IGNORECASE)
META_PATTERN = re.compile(r'^#\s*([^:]+?)\s*:\s*(.*)$')


def connect_db():
    if psycopg2 is None:
        print('[ERROR] 請先安裝 psycopg2：pip3 install psycopg2-binary')
        sys.exit(1)
    password = os.getenv('POSTGRES_PASSWORD')
    if not password:
        print('[ERROR] 缺少 POSTGRES_PASSWORD 環境變數')
        sys.exit(1)
    try:
        return psycopg2.connect(
            host=os.getenv('POSTGRES_HOST', 'localhost'),
            port=os.getenv('POSTGRES_PORT', '5432'),
            dbname=os.getenv('POSTGRES_DB', 'taoyuan_air'),
            user=os.getenv('POSTGRES_USER', 'taoyuan_user'),
            password=password,
        )
    except psycopg2.OperationalError as e:
        print(f'[ERROR] 資料庫連線失敗：{e}')
        sys.exit(1)


def var_key(name: str) -> str:
    """欄名比對用：忽略大小寫和小數點，原始檔的 PM25 對到資料表的 PM2.5。"""
    return name.replace('.', '').upper()


def to_float(text: str, what: str) -> float:
    try:
        return float(text)
    except ValueError:
        raise ValueError(f'{what} 不是數字：{text!r}')


def read_file(path: Path) -> dict:
    """回傳 {iop, site, device_id, instrument, data_level, lat, lon, columns, rows, missing, qc}。
    rows：[(obs_time, {欄名: 數值或 'QC'})]，缺值不放進 dict。"""
    meta: dict[str, str] = {}
    header: list[str] | None = None
    rows = []
    missing = qc = 0

    with open(path, encoding='utf-8-sig') as f:
        lines = f.read().splitlines()

    for line_no, raw in enumerate(lines, start=1):
        line = raw.strip()
        if not line:
            continue
        if line.startswith('#'):
            m = META_PATTERN.match(line)
            if m:
                meta[m.group(1).strip().lower()] = m.group(2).strip()
            continue
        parts = line.split()
        if header is None:
            if parts[0].lower() != 'time':
                raise ValueError(f'第 {line_no} 行應為欄名（Time …），實際為 {line[:40]!r}')
            header = parts
            continue
        if len(parts) != len(header):
            raise ValueError(f'第 {line_no} 行有 {len(parts)} 欄，欄名有 {len(header)} 欄')
        try:
            obs_time = datetime.fromisoformat(parts[0])
        except ValueError:
            raise ValueError(f'第 {line_no} 行時間無法解析：{parts[0]!r}')
        if obs_time.tzinfo is not None:
            raise ValueError(f'第 {line_no} 行時間帶有時區，請確認是否為台灣時間：{parts[0]!r}')
        rows.append((line_no, obs_time, parts[1:]))

    if header is None or not rows:
        raise ValueError('找不到欄名或資料列')

    missing_value = to_float(meta.get('missing_value', '-999'), 'Missing_value')
    qc_value = to_float(meta.get('qc_rejected', '-888'), 'QC_rejected')
    tz = meta.get('time_zone', 'Asia/Taipei')
    if tz not in ('Asia/Taipei', 'UTC+8', 'UTC+08:00'):
        raise ValueError(f'時區為 {tz}，匯入程式只處理台灣時間')

    parsed = []
    seen = set()
    for line_no, obs_time, values in rows:
        if obs_time in seen:
            raise ValueError(f'第 {line_no} 行時間重複：{obs_time}')
        seen.add(obs_time)
        row = {}
        for col, text in zip(header[1:], values):
            v = to_float(text, f'第 {line_no} 行 {col}')
            if v == missing_value:
                missing += 1
            elif v == qc_value:
                row[col] = 'QC'
                qc += 1
            else:
                row[col] = v
        parsed.append((obs_time, row))

    m_meta = IOP_PATTERN.search(meta.get('iop') or '')
    m_name = FILENAME_PATTERN.search(path.name)
    if m_meta and m_name and m_meta.group(1) != m_name.group('iop'):
        raise ValueError(f'檔頭 IOP（{meta["iop"]}）和檔名不一致，請確認是哪一次 IOP')
    if not (m_meta or m_name):
        raise ValueError('檔頭和檔名都找不到 IOP（例如 2026IOP1）')
    iop = f'IOP{m_meta.group(1) if m_meta else m_name.group("iop")}'

    site = meta.get('site_name')
    if not site:
        raise ValueError('檔頭缺少 Site_name')

    def coord(key):
        return to_float(meta[key], key) if meta.get(key) else None

    return {
        'iop': iop,
        'site': site,
        'device_id': meta.get('device_id'),
        'instrument': meta.get('instrument'),
        'data_level': meta.get('data_level'),
        'lat': coord('latitude'),
        'lon': coord('longitude'),
        'columns': header[1:],
        'rows': parsed,
        'missing': missing,
        'qc': qc,
    }


def summary(info: dict, values: int) -> str:
    times = [t for t, _ in info['rows']]
    return (f'{info["iop"]} {info["site"]}（{info["device_id"] or "-"}）：'
            f'{times[0]:%m/%d %H:%M}–{times[-1]:%m/%d %H:%M}，{len(times)} 小時，'
            f'數值 {values}、QC 剔除 {info["qc"]}、缺值 {info["missing"]} 格未匯入')


def import_file(conn, path: Path, variables: dict, iop_ids: set) -> str:
    info = read_file(path)
    if info['iop'] not in iop_ids:
        raise ValueError(f'iop_events 沒有 {info["iop"]}，請先在 database/iop_schema.sql 新增')

    unknown = [c for c in info['columns'] if var_key(c) not in variables]
    if unknown:
        print(f'\n    [WARN] iop_lcs_variables 沒有這些欄位，略過：{", ".join(unknown)}')

    with conn.cursor() as cur:
        cur.execute('DELETE FROM iop_lcs_samples WHERE iop_id = %s AND site = %s',
                    (info['iop'], info['site']))
        sample_ids = execute_values(cur, """
            INSERT INTO iop_lcs_samples
                (iop_id, site, sample_time, device_id, latitude, longitude, source_file)
            VALUES %s
            RETURNING sample_id
        """, [(info['iop'], info['site'], t, info['device_id'], info['lat'], info['lon'], path.name)
              for t, _ in info['rows']], page_size=1000, fetch=True)

        data = []
        for (sample_id,), (_, row) in zip(sample_ids, info['rows']):
            for col, v in row.items():
                vid = variables.get(var_key(col))
                if vid is None:
                    continue
                if v == 'QC':
                    data.append((sample_id, vid, None, 'QC'))
                else:
                    data.append((sample_id, vid, round(v, 4), None))
        execute_values(cur, """
            INSERT INTO iop_lcs_data (sample_id, variables_id, value, flag) VALUES %s
        """, data, page_size=2000)

    return summary(info, sum(1 for d in data if d[3] is None))


def main():
    ap = argparse.ArgumentParser(description='IOP 微型感測器 txt → iop_lcs_samples / iop_lcs_data')
    ap.add_argument('--raw-dir', type=Path, default=RAW_DIR,
                    help='txt 資料夾（預設 data/raw/IOP/LCS，會搜尋子資料夾）')
    ap.add_argument('--dry-run', action='store_true', help='只解析檔案，不寫入資料庫')
    args = ap.parse_args()

    files = sorted(p for p in args.raw_dir.rglob('*.txt') if p.name.upper().startswith('LCS_'))
    if not files:
        print(f'[INFO] 沒有 LCS_*.txt 檔：{args.raw_dir}')
        return
    print(f'找到 {len(files)} 個檔案\n' + '-' * 60)

    if args.dry_run:
        failed = 0
        for path in files:
            try:
                info = read_file(path)
                values = sum(1 for _, row in info['rows'] for v in row.values() if v != 'QC')
                print(f'  {path.name}\n    {summary(info, values)}')
            except Exception as e:
                failed += 1
                print(f'  {path.name}\n    [ERROR] {e}')
        sys.exit(1 if failed else 0)

    conn = connect_db()
    with conn.cursor() as cur:
        cur.execute('SELECT variables_name, variables_id FROM iop_lcs_variables')
        variables = {var_key(name): vid for name, vid in cur.fetchall()}
        cur.execute('SELECT iop_id FROM iop_events')
        iop_ids = {r[0] for r in cur.fetchall()}

    failed = 0
    for path in files:
        print(f'  {path.name}', end=' ... ', flush=True)
        try:
            text = import_file(conn, path, variables, iop_ids)
            conn.commit()
            print(f'\n    {text}')
        except Exception as e:
            conn.rollback()
            failed += 1
            print(f'\n    [ERROR] {e}')
    conn.close()

    print('-' * 60)
    print('完成' if not failed else f'完成，{failed} 個檔案失敗')
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
