#!/usr/bin/env python3
"""
IOP VOCs 採樣資料匯入：讀取 GC-FID 分析結果 xlsx，匯入 vocs_samples / vocs_data。

檔名：VOCs_ {Trigger|UAV}CanisterSampling_GC-FID_{測站}_{年}IOP{n}_*.xlsx（VOCs 後的底線與空白數量不限）
  Trigger → 觸發採樣（trigger），UAV → 無人機採樣（uav，多 Batch、Height 兩欄）
工作表第 1 列為欄名（Time、[Batch、Height、]Canister No.、各物種），第 2 列為單位。

IOP 歸屬：以檔名的 IOP{n} 為準（整個檔案都算該次 IOP）；檔名沒有標 IOP 時，
          才依採樣時間落在 iop_events 哪一段起訖日期內判斷。採樣時間超出 IOP 期間只提示、不排除。
重匯同一個採樣罐（測站＋類型＋時間＋罐號相同）時會覆蓋舊值。

用法（專案根目錄，資料庫要先執行 database/iop_schema.sql）：
  python scripts/import_iop_vocs.py                      # 讀 data/raw/IOP/VOCs
  python scripts/import_iop_vocs.py --raw-dir 路徑 --dry-run
"""

import argparse
import os
import re
import sys
from datetime import datetime
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
RAW_DIR = ROOT_DIR / 'data' / 'raw' / 'IOP' / 'VOCs'

FILENAME_PATTERN = re.compile(
    r'VOCs[_\s]+(?P<type>Trigger|UAV)CanisterSampling_[^_]+_(?P<site>[A-Za-z]+)_'
    r'(?:\d{4})?(?:IOP(?P<iop>\d+))?',
    re.IGNORECASE,
)

SAMPLE_UPSERT_SQL = """
    INSERT INTO vocs_samples
        (iop_id, site, sampling_type, sample_time, batch, height_m, canister_no, source_file)
    VALUES (
        COALESCE(%(iop)s, (SELECT iop_id FROM iop_events
                            WHERE %(time)s::date BETWEEN start_date AND end_date
                            ORDER BY start_date LIMIT 1)),
        %(site)s, %(type)s, %(time)s, %(batch)s, %(height)s, %(canister)s, %(file)s)
    ON CONFLICT (site, sampling_type, sample_time, canister_no) DO UPDATE SET
        iop_id      = EXCLUDED.iop_id,
        batch       = EXCLUDED.batch,
        height_m    = EXCLUDED.height_m,
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


def parse_cell(value):
    """回傳 (value, flag)：數字 → (數值, None)；'N.D.' 等文字 → (None, 原始文字)；空白 → None。"""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, (int, float)):
        return round(float(value), 4), None
    text = str(value).strip()
    try:
        return round(float(text), 4), None
    except ValueError:
        return None, text[:10]


def read_file(path: Path) -> tuple[dict, list]:
    """回傳 (檔案資訊, 樣本列表)。樣本：{time, batch, height, canister, values: {物種: (value, flag)}}"""
    m = FILENAME_PATTERN.search(path.name)
    if not m:
        raise ValueError('檔名格式不符')
    info = {
        'type': 'trigger' if m.group('type').lower() == 'trigger' else 'uav',
        'site': m.group('site').capitalize(),
        'iop': f"IOP{m.group('iop')}" if m.group('iop') else None,
    }

    ws = openpyxl.load_workbook(path, data_only=True, read_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 3:
        raise ValueError('沒有資料列')
    header = [str(h).strip() if h is not None else '' for h in rows[0]]
    units = rows[1]
    for col in ('Time', 'Canister No.'):
        if col not in header:
            raise ValueError(f'缺少欄位 {col}')

    i_time, i_can = header.index('Time'), header.index('Canister No.')
    i_batch = header.index('Batch') if 'Batch' in header else None
    i_height = header.index('Height') if 'Height' in header else None
    variables = [(j, header[j], units[j]) for j in range(i_can + 1, len(header)) if header[j]]
    info['units'] = {name: (str(unit).strip() if unit else None) for _, name, unit in variables}

    samples = []
    for line_no, r in enumerate(rows[2:], start=3):
        if all(v is None for v in r):
            continue
        t = r[i_time]
        if not isinstance(t, datetime):
            raise ValueError(f'第 {line_no} 列時間無法解析：{t!r}')
        values = {}
        for j, name, _ in variables:
            parsed = parse_cell(r[j] if j < len(r) else None)
            if parsed is not None:
                values[name] = parsed
        samples.append({
            'time': t,
            'batch': int(r[i_batch]) if i_batch is not None and r[i_batch] is not None else None,
            'height': float(r[i_height]) if i_height is not None and r[i_height] is not None else None,
            'canister': str(r[i_can]).strip(),
            'values': values,
        })
    return info, samples


def import_file(conn, path: Path, variable_ids: dict, variable_units: dict, iop_ranges: dict) -> dict:
    info, samples = read_file(path)

    if info['iop']:
        if info['iop'] not in iop_ranges:
            raise ValueError(f'iop_events 沒有 {info["iop"]}，請先在 database/iop_schema.sql 新增')
        start, end = iop_ranges[info['iop']]
        outside = [s['time'] for s in samples if not (start <= s['time'].date() <= end)]
        if outside:
            days = sorted({t.strftime('%m/%d') for t in outside})
            print(f'\n    [INFO] {len(outside)} 罐不在 {info["iop"]} 期間（{start:%m/%d}–{end:%m/%d}），'
                  f'仍歸入 {info["iop"]}：{"、".join(days)}')

    unknown = [s for s in info['units'] if s not in variable_ids]
    if unknown:
        print(f'\n    [WARN] vocs_variables 沒有這些物種，略過：{", ".join(unknown)}')
    for name, unit in info['units'].items():
        if name in variable_units and unit and unit != variable_units[name]:
            print(f'\n    [WARN] {name} 單位為 {unit}，與資料表的 {variable_units[name]} 不同')

    stats = {'samples': 0, 'values': 0, 'flags': 0, 'iop': {}}
    with conn.cursor() as cur:
        for s in samples:
            cur.execute(SAMPLE_UPSERT_SQL, {
                'iop': info['iop'], 'site': info['site'], 'type': info['type'], 'time': s['time'],
                'batch': s['batch'], 'height': s['height'],
                'canister': s['canister'], 'file': path.name,
            })
            sample_id, iop_id = cur.fetchone()
            cur.execute('DELETE FROM vocs_data WHERE sample_id = %s', (sample_id,))
            rows = [(sample_id, variable_ids[name], value, flag)
                    for name, (value, flag) in s['values'].items() if name in variable_ids]
            cur.executemany(
                'INSERT INTO vocs_data (sample_id, variables_id, value, flag) VALUES (%s, %s, %s, %s)', rows)
            stats['samples'] += 1
            stats['values'] += sum(1 for r in rows if r[2] is not None)
            stats['flags'] += sum(1 for r in rows if r[2] is None)
            key = iop_id or '不在 IOP 期間'
            stats['iop'][key] = stats['iop'].get(key, 0) + 1
    return {**info, **stats}


def main():
    ap = argparse.ArgumentParser(description='IOP VOCs xlsx → vocs_samples / vocs_data')
    ap.add_argument('--raw-dir', type=Path, default=RAW_DIR, help='xlsx 資料夾（預設 data/raw/IOP/VOCs，會搜尋子資料夾）')
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
                flags = sum(1 for s in samples for v, f in s['values'].values() if v is None)
                print(f'  {path.name}\n    {info["site"]} {info["type"]} {info["iop"] or "(依日期判斷 IOP)"}：{len(samples)} 罐、'
                      f'{len(info["units"])} 種物種、未檢出 {flags} 個')
            except Exception as e:
                print(f'  {path.name}\n    [ERROR] {e}')
        return

    conn = connect_db()
    with conn.cursor() as cur:
        cur.execute('SELECT variables_name, variables_id, unit FROM vocs_variables')
        rows = cur.fetchall()
    variable_ids = {name: sid for name, sid, _ in rows}
    variable_units = {name: unit for name, _, unit in rows}
    with conn.cursor() as cur:
        cur.execute('SELECT iop_id, start_date, end_date FROM iop_events')
        iop_ranges = {iop_id: (start, end) for iop_id, start, end in cur.fetchall()}

    failed = 0
    for path in files:
        print(f'  {path.name}', end=' ... ', flush=True)
        try:
            r = import_file(conn, path, variable_ids, variable_units, iop_ranges)
            conn.commit()
            iop = '、'.join(f'{k} {v} 罐' for k, v in sorted(r['iop'].items()))
            print(f'\n    {r["site"]} {r["type"]}：{r["samples"]} 罐，數值 {r["values"]}、未檢出 {r["flags"]}（{iop}）')
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
