#!/usr/bin/env python3
"""
IOP 大氣汞（Hg）採樣匯入：讀取 xlsx，匯入 iop_hg_samples / iop_hg_data。

檔名：Hg_Sampler_{測站}_{年}IOP{n}_TYDEPproject.xlsx
工作表第 1 列為欄名（Date/Unit、GEM、GOM、PBM），第 2 列為單位，日期為民國年（115/03/27）。
標記 NA / ND / NQ / N/A 存在 flag 欄，空白格不匯入。

IOP 歸屬：以檔名的 IOP{n} 為準。
採樣時間：2026 IOP1、IOP2 的檔案沒有開始／結束時間，且 IOP2 的檔案沿用 IOP1 的日期
  （115/03/27…），所以依下方 SCHEDULE_2026（IOP × 原始檔日期 → 開始、結束時間）對應。
  這是 2026 年兩次 IOP 的歷史對照，寫死在程式裡；之後的檔案若時間表沒有對應，
  日期落在該 IOP 期間就直接用（開始、結束時間留空），否則報錯。
重匯同一天（測站＋採樣日相同）會覆蓋舊值。

用法（專案根目錄，資料庫要先執行 database/iop_schema.sql、database/iop_hg_schema.sql）：
  python scripts/import_iop_hg.py                      # 讀 data/raw/IOP/Hg
  python scripts/import_iop_hg.py --raw-dir 路徑 --dry-run
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
    psycopg2 = None

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / '.env')
except ImportError:
    pass

ROOT_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT_DIR / 'data' / 'raw' / 'IOP' / 'Hg'

FILENAME_PATTERN = re.compile(
    r'^Hg[_\s]*Sampler[_\s]+(?P<site>[A-Za-z]+)[_\s]+(?:\d{4})?IOP(?P<iop>\d+)', re.IGNORECASE)
FLAGS = {'NA', 'ND', 'NQ', 'N/A'}

# 2026 IOP 汞採樣時間（老師提供）。key：(IOP, 原始檔 Date 欄)；value：(開始, 結束)，台灣時間。
# IOP2 的檔案沿用 IOP1 的日期，所以同一個 115/03/27 在 IOP1、IOP2 對到不同日子。
SCHEDULE_2026 = {
    ('IOP1', '115/03/27'): ('2026-03-27 10:15', '2026-03-28 10:00'),
    ('IOP1', '115/03/28'): ('2026-03-28 10:10', '2026-03-29 09:48'),
    ('IOP1', '115/03/29'): ('2026-03-29 10:00', '2026-03-30 09:43'),
    ('IOP1', '115/03/30'): ('2026-03-30 10:00', '2026-03-31 09:50'),
    ('IOP1', '115/03/31'): ('2026-03-31 10:00', '2026-04-01 09:55'),
    ('IOP1', '115/04/01'): ('2026-04-01 10:00', '2026-04-02 09:53'),
    ('IOP1', '115/04/02'): ('2026-04-02 10:00', '2026-04-03 09:45'),
    ('IOP2', '115/03/27'): ('2026-08-17 10:00', '2026-08-18 09:30'),
    ('IOP2', '115/03/28'): ('2026-08-18 10:00', '2026-08-19 09:30'),
    ('IOP2', '115/03/29'): ('2026-08-19 10:00', '2026-08-20 09:30'),
    ('IOP2', '115/03/30'): ('2026-08-20 10:00', '2026-08-21 09:30'),
    ('IOP2', '115/03/31'): ('2026-08-21 10:00', '2026-08-22 09:30'),
    ('IOP2', '115/04/01'): ('2026-08-22 10:00', '2026-08-23 09:30'),
    ('IOP2', '115/04/02'): ('2026-08-23 10:00', '2026-08-24 09:30'),
}

# 與 iop_events 的期間比對用（沒有連資料庫的 --dry-run 也能檢查）
DEFAULT_IOP_RANGES = {
    'IOP1': (date(2026, 3, 27), date(2026, 4, 3)),
    'IOP2': (date(2026, 8, 17), date(2026, 8, 24)),
}

SAMPLE_UPSERT_SQL = """
    INSERT INTO iop_hg_samples (iop_id, site, sample_date, start_time, end_time, file_date, source_file)
    VALUES (%(iop)s, %(site)s, %(date)s, %(start)s, %(end)s, %(file_date)s, %(file)s)
    ON CONFLICT (site, sample_date) DO UPDATE SET
        iop_id      = EXCLUDED.iop_id,
        start_time  = EXCLUDED.start_time,
        end_time    = EXCLUDED.end_time,
        file_date   = EXCLUDED.file_date,
        source_file = EXCLUDED.source_file
    RETURNING sample_id
"""


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


def norm(text) -> str:
    """單位比對用：統一全半形與 μ/µ、去空白。"""
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


def roc_key(value) -> str:
    """把原始檔日期統一成時間表用的 key（民國年，115/03/27）。"""
    d = parse_date(value)
    return f'{d.year - 1911}/{d.month:02d}/{d.day:02d}'


def load_schedule() -> dict:
    """回傳 {(iop_id, '115/03/27'): (start, end)}。"""
    return {
        (iop, roc_key(file_date)): (datetime.fromisoformat(start), datetime.fromisoformat(end))
        for (iop, file_date), (start, end) in SCHEDULE_2026.items()
    }


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


def read_file(path: Path, schedule: dict, iop_ranges: dict) -> tuple[dict, list]:
    """回傳 (檔案資訊, 樣本列表)。樣本：{date, start, end, file_date, values, blank}"""
    m = FILENAME_PATTERN.search(path.name)
    if not m:
        raise ValueError('檔名格式不符（應為 Hg_Sampler_{測站}_{年}IOP{n}_*.xlsx）')
    info = {'site': m.group('site'), 'iop': f"IOP{m.group('iop')}"}
    if info['iop'] not in iop_ranges:
        raise ValueError(f'iop_events 沒有 {info["iop"]}，請先在 database/iop_schema.sql 新增')
    iop_start, iop_end = iop_ranges[info['iop']]

    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 3:
        raise ValueError('沒有資料列')
    header = [str(h).strip() if h is not None else '' for h in rows[0]]
    units = rows[1]
    if not header[0].lower().startswith('date'):
        raise ValueError(f'第一欄應為 Date/Unit，實際為 {header[0]!r}')

    variables = [(j, header[j], units[j]) for j in range(1, len(header)) if header[j]]
    info['units'] = {name: unit for _, name, unit in variables}

    samples, seen = [], set()
    for line_no, r in enumerate(rows[2:], start=3):
        if all(v is None for v in r):
            continue
        try:
            key = roc_key(r[0])
        except ValueError as e:
            raise ValueError(f'第 {line_no} 列{e}')
        start, end = schedule.get((info['iop'], key), (None, None))
        if start:
            sample_date = start.date()
        else:
            sample_date = parse_date(r[0])
            if not (iop_start <= sample_date <= iop_end):
                raise ValueError(
                    f'第 {line_no} 列日期 {key} 不在 {info["iop"]} 期間，'
                    f'且 SCHEDULE_2026 沒有對應，請確認日期或補上採樣時間')
        if sample_date in seen:
            raise ValueError(f'第 {line_no} 列採樣日重複：{sample_date}')
        seen.add(sample_date)

        values, blank = {}, 0
        for j, name, _ in variables:
            try:
                parsed = parse_cell(r[j] if j < len(r) else None)
            except ValueError as e:
                raise ValueError(f'第 {line_no} 列 {name}：{e}')
            if parsed is None:
                blank += 1
            else:
                values[name] = parsed
        samples.append({'date': sample_date, 'start': start, 'end': end,
                        'file_date': key, 'values': values, 'blank': blank})
    return info, samples


def summary(info: dict, samples: list) -> str:
    flags = {}
    for s in samples:
        for _, f in s['values'].values():
            if f:
                flags[f] = flags.get(f, 0) + 1
    values = sum(1 for s in samples for v, _ in s['values'].values() if v is not None)
    blank = sum(s['blank'] for s in samples)
    first, last = samples[0], samples[-1]
    period = (f'{first["start"]:%m/%d %H:%M}–{last["end"]:%m/%d %H:%M}'
              if first['start'] and last['end'] else f'{first["date"]:%m/%d}–{last["date"]:%m/%d}')
    shifted = '（原始檔日期已依時間表對應）' if any(
        s['date'] != parse_date(s['file_date']) for s in samples) else ''
    text = (f'{info["site"]} {info["iop"]}：{period}，{len(samples)} 天{shifted}，'
            f'數值 {values}、標記 {"、".join(f"{k} {v}" for k, v in sorted(flags.items())) or "無"}')
    return text + (f'、空白 {blank} 格未匯入' if blank else '')


def import_file(conn, path: Path, variables: dict, schedule: dict, iop_ranges: dict) -> str:
    info, samples = read_file(path, schedule, iop_ranges)

    unknown = [n for n in info['units'] if n not in variables]
    if unknown:
        print(f'\n    [WARN] iop_hg_variables 沒有這些物種，略過：{", ".join(unknown)}')
    for name, unit in info['units'].items():
        if name in variables and unit and norm(unit) != norm(variables[name][1]):
            print(f'\n    [WARN] {name} 單位為 {unit}，與資料表的 {variables[name][1]} 不同')

    with conn.cursor() as cur:
        for s in samples:
            cur.execute(SAMPLE_UPSERT_SQL, {
                'iop': info['iop'], 'site': info['site'], 'date': s['date'],
                'start': s['start'], 'end': s['end'], 'file_date': s['file_date'], 'file': path.name,
            })
            sample_id = cur.fetchone()[0]
            cur.execute('DELETE FROM iop_hg_data WHERE sample_id = %s', (sample_id,))
            cur.executemany(
                'INSERT INTO iop_hg_data (sample_id, variables_id, value, flag) VALUES (%s, %s, %s, %s)',
                [(sample_id, variables[n][0], v, f) for n, (v, f) in s['values'].items() if n in variables])
    return summary(info, samples)


def main():
    ap = argparse.ArgumentParser(description='IOP 大氣汞 xlsx → iop_hg_samples / iop_hg_data')
    ap.add_argument('--raw-dir', type=Path, default=RAW_DIR,
                    help='xlsx 資料夾（預設 data/raw/IOP/Hg，會搜尋子資料夾）')
    ap.add_argument('--dry-run', action='store_true', help='只解析檔案，不寫入資料庫')
    args = ap.parse_args()

    files = sorted(p for p in args.raw_dir.rglob('*.xlsx')
                   if not p.name.startswith('~$') and FILENAME_PATTERN.search(p.name))
    if not files:
        print(f'[INFO] 沒有 Hg_Sampler_*.xlsx 檔：{args.raw_dir}')
        return
    schedule = load_schedule()
    print(f'找到 {len(files)} 個檔案，採樣時間表 {len(schedule)} 筆\n' + '-' * 60)

    if args.dry_run:
        failed = 0
        for path in files:
            try:
                info, samples = read_file(path, schedule, DEFAULT_IOP_RANGES)
                print(f'  {path.name}\n    {summary(info, samples)}')
            except Exception as e:
                failed += 1
                print(f'  {path.name}\n    [ERROR] {e}')
        sys.exit(1 if failed else 0)

    conn = connect_db()
    with conn.cursor() as cur:
        cur.execute('SELECT variables_name, variables_id, unit FROM iop_hg_variables')
        variables = {name: (vid, unit) for name, vid, unit in cur.fetchall()}
        cur.execute('SELECT iop_id, start_date, end_date FROM iop_events')
        iop_ranges = {iop_id: (start, end) for iop_id, start, end in cur.fetchall()}

    failed = 0
    for path in files:
        print(f'  {path.name}', end=' ... ', flush=True)
        try:
            text = import_file(conn, path, variables, schedule, iop_ranges)
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
