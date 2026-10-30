#!/usr/bin/env python3
"""
IOP 氣膠化學（濾紙採樣）匯入：讀取 xlsx，匯入 iop_aerosol_samples / iop_aerosol_data。

檔名：AersolChemistry_{PM2p5|PM1}FilterSample__{測站}_{年}IOP{n}_*.xlsx
  （Aerosol 拼法、底線與空白數量不限；PM2p5 → PM2.5）
工作表第 1 列為欄名（Date/Unit、PM2.5 或 PM1.0、各變數），第 2 列為單位，
日期為民國年（115/03/27）。標記 NA / ND / NQ / N/A 存在 flag 欄，空白格不匯入。

IOP 歸屬同 VOCs：以檔名 IOP{n} 為準，沒有標才依日期判斷。
重匯同一張濾紙（測站＋粒徑＋日期相同）會覆蓋舊值。

用法（專案根目錄，資料庫要先執行 database/iop_schema.sql、database/iop_aerosol_schema.sql）：
  python scripts/import_iop_aerosol.py                      # 讀 data/raw/IOP/Aerosol
  python scripts/import_iop_aerosol.py --raw-dir 路徑 --dry-run
"""

import argparse
import os
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print('[ERROR] 請先安裝 openpyxl：pip3 install openpyxl')
    sys.exit(1)

try:
    import psycopg2
except ImportError:
    print('[ERROR] 請先安裝 psycopg2：pip3 install psycopg2-binary')
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / '.env')
except ImportError:
    pass

ROOT_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT_DIR / 'data' / 'raw' / 'IOP' / 'Aerosol'

FILENAME_PATTERN = re.compile(
    r'Aero?sol[_\s]*Chemistry[_\s]+(?P<pm>PM\d+(?:p\d+)?)FilterSample[_\s]+(?P<site>[A-Za-z]+)[_\s]+'
    r'(?:\d{4})?(?:IOP(?P<iop>\d+))?',
    re.IGNORECASE,
)
FLAGS = {'NA', 'ND', 'NQ', 'N/A'}
MASS_HEADER = re.compile(r'^PM\s*\d', re.IGNORECASE)   # PM2.5 / PM1.0 欄 → Mass

SAMPLE_UPSERT_SQL = """
    INSERT INTO iop_aerosol_samples (iop_id, site, pm_size, sample_date, source_file)
    VALUES (
        COALESCE(%(iop)s, (SELECT iop_id FROM iop_events
                            WHERE %(date)s BETWEEN start_date AND end_date
                            ORDER BY start_date LIMIT 1)),
        %(site)s, %(pm)s, %(date)s, %(file)s)
    ON CONFLICT (site, pm_size, sample_date) DO UPDATE SET
        iop_id      = EXCLUDED.iop_id,
        source_file = EXCLUDED.source_file
    RETURNING sample_id, iop_id
"""


def connect_db():
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


def norm(text) -> str:
    """欄名、單位比對用：統一全半形與 μ/µ、去空白。"""
    return unicodedata.normalize('NFKC', str(text or '')).replace(' ', '').lower()


def parse_date(value) -> date:
    """民國 115/03/27、西元 2026/03/27 或 Excel 日期。"""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    m = re.fullmatch(r'(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})', str(value).strip())
    if not m:
        raise ValueError(f'日期無法解析：{value!r}')
    y, mo, d = map(int, m.groups())
    return date(y + 1911 if y < 1911 else y, mo, d)


def parse_cell(value):
    """回傳 (value, flag)；空白回傳 None。"""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, (int, float)):
        return round(float(value), 6), None
    text = str(value).strip()
    try:
        return round(float(text), 6), None
    except ValueError:
        pass
    flag = text.upper().replace('.', '')
    if flag in FLAGS:
        return None, flag
    raise ValueError(f'無法辨識的值：{text!r}（標記只接受 NA / ND / NQ / N/A）')


def read_file(path: Path) -> tuple[dict, list]:
    """回傳 (檔案資訊, 樣本列表)。樣本：{date, values: {變數: (value, flag)}, blank: 空白格數}"""
    m = FILENAME_PATTERN.search(path.name)
    if not m:
        raise ValueError('檔名格式不符')
    pm = m.group('pm').upper()
    info = {
        'pm': {'PM2P5': 'PM2.5', 'PM1': 'PM1'}.get(pm, pm),
        'site': m.group('site'),
        'iop': f"IOP{m.group('iop')}" if m.group('iop') else None,
    }
    if info['pm'] not in ('PM2.5', 'PM1'):
        raise ValueError(f'不支援的粒徑：{m.group("pm")}')

    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 3:
        raise ValueError('沒有資料列')
    header = [str(h).strip() if h is not None else '' for h in rows[0]]
    units = rows[1]
    if not header[0].lower().startswith('date'):
        raise ValueError(f'第一欄應為 Date/Unit，實際為 {header[0]!r}')

    variables = []
    for j in range(1, len(header)):
        if not header[j]:
            continue
        name = 'Mass' if MASS_HEADER.match(header[j]) else header[j]
        variables.append((j, name, units[j]))
    info['units'] = {name: unit for _, name, unit in variables}

    samples = []
    for line_no, r in enumerate(rows[2:], start=3):
        if all(v is None for v in r):
            continue
        values, blank = {}, 0
        for j, name, _ in variables:
            try:
                parsed = parse_cell(r[j] if j < len(r) else None)
            except ValueError as e:
                raise ValueError(f'第 {line_no} 列 {header[j]}：{e}')
            if parsed is None:
                blank += 1
            else:
                values[name] = parsed
        try:
            d = parse_date(r[0])
        except ValueError as e:
            raise ValueError(f'第 {line_no} 列{e}')
        samples.append({'date': d, 'values': values, 'blank': blank})
    return info, samples


def import_file(conn, path: Path, variables: dict, iop_ranges: dict) -> dict:
    info, samples = read_file(path)

    if info['iop']:
        if info['iop'] not in iop_ranges:
            raise ValueError(f'iop_events 沒有 {info["iop"]}，請先在 database/iop_schema.sql 新增')
        start, end = iop_ranges[info['iop']]
        outside = sorted(s['date'] for s in samples if not (start <= s['date'] <= end))
        if outside:
            print(f'\n    [INFO] {len(outside)} 天不在 {info["iop"]} 期間，仍歸入 {info["iop"]}：'
                  f'{"、".join(d.strftime("%m/%d") for d in outside)}')

    unknown = [n for n in info['units'] if n not in variables]
    if unknown:
        print(f'\n    [WARN] iop_aerosol_variables 沒有這些變數，略過：{", ".join(unknown)}')
    for name, unit in info['units'].items():
        if name in variables and unit and norm(unit) != norm(variables[name][1]):
            print(f'\n    [WARN] {name} 單位為 {unit}，與資料表的 {variables[name][1]} 不同')

    stats = {'samples': 0, 'values': 0, 'flags': {}, 'blank': 0}
    with conn.cursor() as cur:
        for s in samples:
            cur.execute(SAMPLE_UPSERT_SQL, {
                'iop': info['iop'], 'site': info['site'], 'pm': info['pm'],
                'date': s['date'], 'file': path.name,
            })
            sample_id, _ = cur.fetchone()
            cur.execute('DELETE FROM iop_aerosol_data WHERE sample_id = %s', (sample_id,))
            rows = [(sample_id, variables[n][0], value, flag)
                    for n, (value, flag) in s['values'].items() if n in variables]
            cur.executemany(
                'INSERT INTO iop_aerosol_data (sample_id, variables_id, value, flag) VALUES (%s, %s, %s, %s)', rows)
            stats['samples'] += 1
            stats['blank'] += s['blank']
            for _, _, value, flag in rows:
                if flag:
                    stats['flags'][flag] = stats['flags'].get(flag, 0) + 1
                else:
                    stats['values'] += 1
    return {**info, **stats}


def summary(r: dict) -> str:
    flags = '、'.join(f'{k} {v}' for k, v in sorted(r['flags'].items())) or '無'
    text = f'{r["site"]} {r["pm"]} {r["iop"] or ""}：{r["samples"]} 天，數值 {r["values"]}、標記 {flags}'
    return text + (f'、空白 {r["blank"]} 格未匯入' if r['blank'] else '')


def main():
    ap = argparse.ArgumentParser(description='IOP 氣膠化學 xlsx → iop_aerosol_samples / iop_aerosol_data')
    ap.add_argument('--raw-dir', type=Path, default=RAW_DIR, help='xlsx 資料夾（預設 data/raw/IOP/Aerosol，會搜尋子資料夾）')
    ap.add_argument('--dry-run', action='store_true', help='只解析檔案，不寫入資料庫')
    args = ap.parse_args()

    files = sorted(p for p in args.raw_dir.rglob('*.xlsx') if not p.name.startswith('~$'))
    if not files:
        print(f'[INFO] 沒有 xlsx 檔：{args.raw_dir}')
        return
    print(f'找到 {len(files)} 個檔案\n' + '-' * 60)

    if args.dry_run:
        for path in files:
            try:
                info, samples = read_file(path)
                r = {**info, 'samples': len(samples), 'blank': sum(s['blank'] for s in samples),
                     'values': sum(1 for s in samples for v, _ in s['values'].values() if v is not None),
                     'flags': {}}
                for s in samples:
                    for _, f in s['values'].values():
                        if f:
                            r['flags'][f] = r['flags'].get(f, 0) + 1
                print(f'  {path.name}\n    {summary(r)}')
            except Exception as e:
                print(f'  {path.name}\n    [ERROR] {e}')
        return

    conn = connect_db()
    with conn.cursor() as cur:
        cur.execute('SELECT variables_name, variables_id, unit FROM iop_aerosol_variables')
        variables = {name: (vid, unit) for name, vid, unit in cur.fetchall()}
        cur.execute('SELECT iop_id, start_date, end_date FROM iop_events')
        iop_ranges = {iop_id: (start, end) for iop_id, start, end in cur.fetchall()}

    failed = 0
    for path in files:
        print(f'  {path.name}', end=' ... ', flush=True)
        try:
            r = import_file(conn, path, variables, iop_ranges)
            conn.commit()
            print(f'\n    {summary(r)}')
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
