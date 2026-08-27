#!/usr/bin/env python3
"""
NAQO Supabase → PostgreSQL 同步工具。

以來源 inserted_at 作為浮標，避免儀器補傳舊 observed_at 時漏資料。
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx
import psycopg2
from psycopg2.extras import execute_batch

try:
    from dotenv import load_dotenv
    ROOT_DIR = Path(__file__).parent.parent
    load_dotenv(ROOT_DIR / ".env")
    load_dotenv(ROOT_DIR / "backend" / ".env", override=False)
except ImportError:
    pass


PARAMETERS = {
    "PM25": ("細懸浮微粒", "PM2.5", "UGM"),
    "O3": ("臭氧", "O3", "PPB"),
    "CO": ("一氧化碳", "CO", "PPM"),
    "SO2": ("二氧化硫", "SO2", "PPB"),
    "NOX": ("氮氧化物", "NOx", "PPB"),
    "CO2": ("二氧化碳", "CO2", "PPM"),
}

INVALID_TOKENS = {"", "x", "X", "NA", "N/A", "null", "None", "-", "#", "*", "nan"}
SENTINEL_VALUES = {-999, -9999, -99.9, 999, 9999}
VALID_RANGE = {
    "PM25": (-5, 1000),
    "O3": (-5, 500),
    "CO": (-5, 50),
    "SO2": (-5, 500),
    "NOX": (-5, 1000),
    "CO2": (-5, 5000),
}

DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": os.getenv("POSTGRES_PORT", "5432"),
    "database": os.getenv("POSTGRES_DB", "taoyuan_air"),
    "user": os.getenv("POSTGRES_USER", "taoyuan_user"),
    "password": os.getenv("POSTGRES_PASSWORD"),
}


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        print(f"[ERROR] 缺少 {name} 環境變數")
        sys.exit(1)
    return value


def connect_db():
    if not DB_CONFIG["password"]:
        print("[ERROR] 缺少 POSTGRES_PASSWORD 環境變數")
        sys.exit(1)
    return psycopg2.connect(**DB_CONFIG)


def parse_time(raw: Any, tz_workaround: bool = True) -> Optional[datetime]:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    if tz_workaround:
        return dt.replace(tzinfo=ZoneInfo("Asia/Taipei"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=ZoneInfo("Asia/Taipei"))
    return dt


def parse_concentration(raw: Any, pollutant_id: str) -> tuple[Optional[float], str]:
    if raw is None:
        return None, "missing"
    if isinstance(raw, str) and raw.strip() in INVALID_TOKENS:
        return None, "invalid"
    try:
        value = float(raw)
    except (ValueError, TypeError):
        return None, "invalid"
    if value in SENTINEL_VALUES:
        return None, "invalid"
    lo, hi = VALID_RANGE.get(pollutant_id, (float("-inf"), float("inf")))
    if not (lo <= value <= hi):
        return value, "invalid"
    return value, "good"


def get_watermark(conn) -> datetime:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COALESCE(MAX(source_inserted_at), '1970-01-01'::timestamptz)
            FROM naqo_hourly_data
        """)
        return cur.fetchone()[0]


def fetch_supabase_rows(params: dict[str, str], limit: int = 1000) -> list[dict[str, Any]]:
    url = require_env("NAQO_SUPABASE_URL").rstrip("/")
    key = require_env("NAQO_SUPABASE_ANON_KEY")
    table = os.getenv("NAQO_SUPABASE_TABLE", "min60")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Range": f"0-{limit - 1}",
    }
    response = httpx.get(f"{url}/rest/v1/{table}", params=params, headers=headers, timeout=30.0)
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, list) else []


def row_to_records(row: dict[str, Any]) -> list[tuple]:
    observed_at = parse_time(row.get("observed_at"))
    source_inserted_at = parse_time(row.get("inserted_at"), tz_workaround=False)
    if observed_at is None:
        return []

    data_type = str(row.get("data_type") or os.getenv("NAQO_DEFAULT_DATA_TYPE", "min60"))
    records = []
    for pollutant_id, (name, display, unit) in PARAMETERS.items():
        if pollutant_id not in row:
            continue
        value, quality = parse_concentration(row.get(pollutant_id), pollutant_id)
        records.append((
            "NCU_NAQO",
            observed_at,
            data_type,
            pollutant_id,
            name,
            display,
            unit,
            None if row.get(pollutant_id) is None else str(row.get(pollutant_id)),
            value,
            quality,
            source_inserted_at,
        ))
    return records


def upsert_records(conn, records: list[tuple]) -> int:
    if not records:
        return 0
    sql = """
        INSERT INTO naqo_hourly_data (
            station_id, monitor_date, data_type, pollutant_id,
            pollutant_name, pollutant_eng_name, unit,
            concentration, concentration_numeric, data_quality, source_inserted_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (station_id, monitor_date, data_type, pollutant_id)
        DO UPDATE SET
            concentration = EXCLUDED.concentration,
            concentration_numeric = EXCLUDED.concentration_numeric,
            data_quality = EXCLUDED.data_quality,
            unit = EXCLUDED.unit,
            source_inserted_at = EXCLUDED.source_inserted_at,
            updated_at = NOW()
        WHERE EXCLUDED.source_inserted_at IS NULL
           OR naqo_hourly_data.source_inserted_at IS NULL
           OR EXCLUDED.source_inserted_at >= naqo_hourly_data.source_inserted_at
    """
    with conn.cursor() as cur:
        execute_batch(cur, sql, records, page_size=1000)
    conn.commit()
    return len(records)


def sync_incremental(conn) -> int:
    watermark = get_watermark(conn)
    total = 0
    while True:
        rows = fetch_supabase_rows({
            "select": "*",
            "inserted_at": f"gt.{watermark.isoformat()}",
            "order": "inserted_at.asc",
            "limit": "1000",
        })
        if not rows:
            break
        records = [record for row in rows for record in row_to_records(row)]
        total += upsert_records(conn, records)
        inserted_times = [parse_time(row.get("inserted_at"), tz_workaround=False) for row in rows]
        inserted_times = [dt for dt in inserted_times if dt is not None]
        if inserted_times:
            watermark = max(inserted_times)
        if len(rows) < 1000:
            break
    return total


def sync_range(conn, start: str, end: str) -> int:
    rows = fetch_supabase_rows({
        "select": "*",
        "and": f"(observed_at.gte.{start},observed_at.lt.{end})",
        "order": "observed_at.asc",
        "limit": "1000",
    })
    records = [record for row in rows for record in row_to_records(row)]
    return upsert_records(conn, records)


def main():
    parser = argparse.ArgumentParser(description="同步 NAQO Supabase min60 資料")
    parser.add_argument("--data-type", default=os.getenv("NAQO_DEFAULT_DATA_TYPE", "min60"), help="保留參數：目前由 table 決定資料類型")
    parser.add_argument("--start", help="回補開始時間，例如 2026-08-01T00:00:00")
    parser.add_argument("--end", help="回補結束時間，例如 2026-08-08T00:00:00")
    parser.add_argument("--full-check", action="store_true", help="保留參數：後續擴充全量校驗")
    args = parser.parse_args()

    conn = connect_db()
    try:
        if args.start and args.end:
            total = sync_range(conn, args.start, args.end)
        else:
            total = sync_incremental(conn)
    finally:
        conn.close()

    print(f"[OK] NAQO 同步完成，處理 long records: {total:,}")


if __name__ == "__main__":
    main()
