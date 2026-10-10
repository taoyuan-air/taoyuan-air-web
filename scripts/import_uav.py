#!/usr/bin/env python3
"""
UAV 資料匯入腳本
直接讀取 data/raw/UAV/UAV_V1_L3_gas_*.txt 並批次匯入 PostgreSQL 的 uav_data 分區表

檔名格式： UAV_V1_L3_gas_20260330_0025_Aeromount(V4)_Guanyin.txt
           (儀器_反演版本_資料級別_量測主要參數_觀測起始年月日_小時分鐘_儀器版本_測站)

txt 格式：
  metadata header（key: value 行，到 '==' 分隔線結束）
  分隔線之後：
    第 1 行：單位（如 (m), (hPa), ...）
    第 2 行：欄位名稱（agl, asl, P, T, ...）
    第 3 行起：資料（NaN 存為 NULL），逗號分隔
  若觀測高度低於 3 km 則補缺值 NaN 於 L3 檔案中

注意：agl 欄位作為層鍵（agl_m），不另外插入 uav_data 作為參數
"""

import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    import psycopg2
    from psycopg2 import sql
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

# 新檔名格式：UAV_V1_L3_gas_20260330_0025_Aeromount(V4)_Guanyin.txt
# 群組：(instrument)_(version)_(level)_(measType)_(date)_(time)_(instrumentVer)_(site).txt
FILENAME_PATTERN = re.compile(
    r'^UAV_V(\d+)_L(\d+)_([a-zA-Z]+)_(\d{8})_(\d{4})_(.+)_([A-Za-z]+)\.txt$'
)


def parse_filename(filename: str) -> Optional[dict]:
    """
    解析 UAV 檔名，回傳 metadata dict 或 None。

    範例：UAV_V1_L3_gas_20260330_0025_Aeromount(V4)_Guanyin.txt
    → {
        'version': '1',
        'level': 'L3',
        'meas_type': 'gas',
        'date': '20260330',
        'time': '0025',
        'instrument': 'Aeromount(V4)',
        'site': 'Guanyin',
        'flight_id': '20260330_0025',
      }
    """
    m = FILENAME_PATTERN.match(filename)
    if not m:
        return None
    return {
        'version':    m.group(1),
        'level':      f'L{m.group(2)}',
        'meas_type':  m.group(3),
        'date':       m.group(4),
        'time':       m.group(5),
        'instrument': m.group(6),
        'site':       m.group(7),
        'flight_id':  f"{m.group(4)}_{m.group(5)}",
    }


def parse_file_metadata(lines: list[str]) -> tuple[dict, int]:
    """
    解析檔案開頭的 metadata header（key: value 格式），
    回傳 (metadata_dict, data_start_index)。
    data_start_index 指向分隔線 '==' 之後的下一行（即單位行）。
    """
    metadata = {}
    data_start = 0

    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('=='):
            data_start = i + 1
            break
        if ':' in stripped:
            key, _, val = stripped.partition(':')
            metadata[key.strip()] = val.strip()

    return metadata, data_start

# ── 量測參數欄位（不含 agl，agl 單獨作為層鍵 agl_m）────────────────────────
PARAM_COLS = [
    'asl', 'P', 'T', 'RH', 'PM1', 'PM2.5', 'PM10',
    'ws', 'wd', 'theta', 'Td', 'q', 'mixR', 'Tv', 'thetav',
    'O3', 'CO', 'CO2', 'SO2', 'NO2', 'NH3', 'H2S', 'TVOC',
]

MEASUREMENT_PARAM_COLS = [param_id for param_id in PARAM_COLS if param_id != 'asl']

HEADER_ALIASES = {
    'PM25': 'PM2.5',
}

MAX_AGL_M = 3000.0

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


def ensure_uav_flight_and_partition(
    conn,
    flight_id: str,
    takeoff_time: datetime,
    data_level: str,
    flight_direction: str,
    site_name: str,
    file_meta: dict,
) -> None:
    """自動補齊飛行任務基本資料與 flight_id LIST 分區。"""
    partition_name = f"uav_data_{flight_id}"

    latitude  = float(file_meta.get('latitude', 25.0605))
    longitude = float(file_meta.get('longitude', 121.1288))
    altitude_m = float(file_meta.get('altitude_m', 17.0))
    max_agl_m  = float(file_meta.get('max_agl_m', 0))
    instrument = file_meta.get('instrument_version', 'unknown')
    data_release_date = file_meta.get('data_release_date', '').replace('/', '-') or None

    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO uav_flights
                (flight_id, flight_direction, takeoff_time, data_release_date, data_level,
                 site_name, latitude, longitude, altitude_m, instrument, max_agl_m)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (flight_id) DO UPDATE SET
                takeoff_time      = EXCLUDED.takeoff_time,
                flight_direction  = EXCLUDED.flight_direction,
                data_level        = EXCLUDED.data_level,
                data_release_date = EXCLUDED.data_release_date,
                instrument        = EXCLUDED.instrument,
                site_name         = EXCLUDED.site_name,
                latitude          = EXCLUDED.latitude,
                longitude         = EXCLUDED.longitude,
                altitude_m        = EXCLUDED.altitude_m,
                max_agl_m         = EXCLUDED.max_agl_m,
                updated_at        = NOW()
            """,
            (
                flight_id,
                flight_direction,
                takeoff_time,
                data_release_date,
                data_level,
                site_name,
                latitude,
                longitude,
                altitude_m,
                instrument,
                max_agl_m,
            ),
        )
        cursor.execute(
            sql.SQL(
                """
                CREATE TABLE IF NOT EXISTS {partition}
                PARTITION OF uav_data
                FOR VALUES IN (%s)
                """
            ).format(partition=sql.Identifier(partition_name)),
            (flight_id,),
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'    [ERROR] UAV 分區建立失敗: {e}')
        raise
    finally:
        if cursor:
            cursor.close()


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


def row_has_any_valid_measurement(row: dict) -> bool:
    """排除高度欄位，判斷該高度層是否還有任一有效量測值。"""
    for param_id in MEASUREMENT_PARAM_COLS:
        if param_id not in row:
            continue
        _, value, quality = parse_value(row.get(param_id, ''))
        if quality == 'good' and value is not None:
            return True
    return False


def parse_txt_file(filepath: Path, flight_id: str):
    """
    解析單一 txt 檔，yield INSERT tuple。

    新格式：
    - metadata header（key: value，到 '==' 分隔線結束）
    - 分隔線之後：
      - lines[0]：單位行（跳過）
      - lines[1]：欄位名稱行
      - lines[2:]：資料行（逗號分隔）

    L3 檔案為 3 km 以下資料；若高度超過 3 km 則跳過。
    agl 只作為 agl_m 層鍵，不插入 uav_data。
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    if len(lines) < 3:
        return

    # 解析 metadata header，取得 data 開始位置
    _, data_start = parse_file_metadata(lines)

    data_lines = lines[data_start:]
    if len(data_lines) < 3:
        return

    # data_lines[0] = 單位行（跳過）
    # data_lines[1] = 欄位名稱行
    # data_lines[2:] = 資料行
    header_line = data_lines[1].strip()
    sep = ','

    col_names = [
        HEADER_ALIASES.get(column.strip(), column.strip())
        for column in header_line.split(sep)
    ]

    for line in data_lines[2:]:
        line = line.strip()
        if not line:
            continue

        values = [v.strip() for v in line.split(sep)]
        if len(values) < len(col_names):
            continue

        row = dict(zip(col_names, values))

        # 解析 agl 作為層鍵
        try:
            agl_m = float(row.get('agl', '').strip())
        except (ValueError, TypeError):
            continue

        # L3 檔案定義為 3 km 以下資料，超過時跳過。
        if agl_m > MAX_AGL_M:
            continue

        # L3 會在實際最高觀測高度以上以 NaN 補到 3 km。
        # 若某高度層所有量測欄位都無有效值，視為進入補值區並停止讀取該檔。
        if not row_has_any_valid_measurement(row):
            break

        # 插入各參數（不含 agl）
        for param_id in PARAM_COLS:
            if param_id not in row:
                continue
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
    # 從檔名解析 metadata
    fname_meta = parse_filename(filepath.name)
    if not fname_meta:
        print(f'\n    [WARN] 檔名格式不符，跳過: {filepath.name}')
        return 0, 0, 0

    flight_id = fname_meta['flight_id']
    data_level = fname_meta['level']
    site_name = fname_meta['site']

    # 從檔案 header 解析 metadata
    with open(filepath, 'r', encoding='utf-8') as f:
        all_lines = f.readlines()

    file_meta, _ = parse_file_metadata(all_lines)

    # 優先使用檔案內的 metadata，檔名資訊作為 fallback
    flight_direction = file_meta.get('flight_direction', 'ascending')
    file_meta['instrument_version'] = fname_meta['instrument']

    try:
        # 以檔名日期 + 時間作為 takeoff_time
        takeoff_time = datetime.strptime(flight_id, '%Y%m%d_%H%M')
    except ValueError:
        print(f'    [ERROR] 檔名時間格式不符：{filepath.name}')
        return 0, 0, 0

    rows    = list(parse_txt_file(filepath, flight_id))
    valid   = sum(1 for r in rows if r[5] == 'good')
    invalid = len(rows) - valid

    if not rows:
        return 0, 0, 0

    cursor = None
    try:
        ensure_uav_flight_and_partition(
            conn,
            flight_id,
            takeoff_time,
            data_level,
            flight_direction,
            site_name,
            file_meta,
        )
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

    txt_files = sorted(RAW_DIR.glob('UAV_V*_L*_*.txt'))
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
        fname_meta = parse_filename(txt_path.name)
        flight_id = fname_meta['flight_id'] if fname_meta else txt_path.stem
        print(f'  [{idx}/{len(txt_files)}] {flight_id} ...', end=' ', flush=True)

        total, valid, invalid = import_txt_file(conn, txt_path)
        grand_total   += total
        grand_valid   += valid
        grand_invalid += invalid
        print(f'解析 {total:,} 列  (有效:{valid:,} 無效:{invalid:,})')

    conn.close()

    print('\n' + '=' * 60)
    print('匯入完成')
    print('=' * 60)
    print(f'解析總列數: {grand_total:,}')
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
