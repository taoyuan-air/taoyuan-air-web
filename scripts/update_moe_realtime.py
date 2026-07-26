#!/usr/bin/env python3
"""
MOE 即時資料入庫腳本。

流程：
  MOE aqx_p_432 即時 API
    -> 桃園 6 個環境部測站
    -> moe_hourly_data
    -> source = 'realtime'

設計原則：
  - 即時資料只補進資料庫，不覆蓋 source='history' 的正式歷史資料。
  - 每月正式歷史資料釋出後，仍由 update_moe_monthly.py 覆蓋 realtime。
  - 分區沿用 import_moe_stations.py 的 ensure_moe_partitions。

需要環境變數：
  POSTGRES_PASSWORD
  MOE_API_KEY 或 NEXT_PUBLIC_MOE_API_KEY
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from psycopg2.extras import execute_batch


ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / "frontend-web" / ".env.local")

from import_moe_stations import (  # noqa: E402
    connect_db,
    ensure_moe_hourly_schema,
    ensure_moe_partitions,
    ensure_moe_station_names,
    parse_concentration,
    parse_monitor_date,
)


MOE_API_KEY = os.getenv("MOE_API_KEY") or os.getenv("NEXT_PUBLIC_MOE_API_KEY")
MOE_API_URL = "https://data.moenv.gov.tw/api/v2/aqx_p_432"

TARGET_STATIONS = ["桃園", "中壢", "平鎮", "龍潭", "大園", "觀音"]
TARGET_STATION_IDS = {
    "桃園": "17",
    "大園": "18",
    "觀音": "19",
    "平鎮": "20",
    "龍潭": "21",
    "中壢": "68",
}

POLLUTANT_MAP = {
    "so2": ("1", "二氧化硫", "SO2", "ppb"),
    "co": ("2", "一氧化碳", "CO", "ppm"),
    "o3": ("3", "臭氧", "O3", "ppb"),
    "no2": ("7", "二氧化氮", "NO2", "ppb"),
    "pm10": ("4", "懸浮微粒", "PM10", "ug/m3"),
    "pm2.5": ("33", "細懸浮微粒", "PM2.5", "ug/m3"),
}

UPSERT_SQL = """
    INSERT INTO moe_hourly_data
        (station_id, monitor_date, pollutant_id, pollutant_name,
         pollutant_eng_name, unit, concentration, concentration_numeric,
         data_quality, period_start, period_end, source)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'realtime')
    ON CONFLICT (station_id, monitor_date, pollutant_id)
    DO UPDATE SET
        concentration = EXCLUDED.concentration,
        concentration_numeric = EXCLUDED.concentration_numeric,
        data_quality = EXCLUDED.data_quality,
        period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        source = 'realtime',
        created_at = NOW()
    WHERE moe_hourly_data.source = 'realtime'
"""


def parse_realtime_time(value: Optional[str]) -> Optional[datetime]:
    """解析 MOE 即時 API 時間，支援 yyyy/mm/dd 與既有匯入格式。"""
    if not value:
        return None

    text = str(value).strip()
    for fmt in (
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
    ):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue

    return parse_monitor_date(text)


def fetch_moe_station(station_name: str) -> list:
    """抓單一 MOE 測站即時資料。"""
    params = urlencode({
        "format": "json",
        "offset": "0",
        "limit": "10",
        "api_key": MOE_API_KEY,
    })
    # MOE filters 裡的逗號不能被 URLSearchParams 轉成 %2C，所以手動接上。
    url = f"{MOE_API_URL}?{params}&filters=SiteName,EQ,{quote(station_name)}"
    request = Request(url, headers={"User-Agent": "taoyuan-air-moe-realtime/1.0"})

    with urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    if isinstance(payload, list):
        return payload

    records = payload.get("records") or []
    if not records:
        message = payload.get("message") or payload.get("Message") or payload.get("error")
        if message:
            print(f"[WARNING] {station_name} API 無資料：{message}")
    return records


def build_rows(records: list) -> list:
    """將 MOE API records 轉成 moe_hourly_data 可寫入的長表資料。"""
    rows = []

    for record in records:
        site_name = str(record.get("sitename") or record.get("SiteName") or "").strip()
        station_id = str(record.get("siteid") or "").strip() or TARGET_STATION_IDS.get(site_name)
        monitor_date = parse_realtime_time(
            record.get("publishtime")
            or record.get("datacreationdate")
            or record.get("DataCreationDate")
        )

        if not station_id or monitor_date is None:
            continue

        # 只處理桃園 6 站，過濾掉 API 混入的其他測站
        if station_id not in TARGET_STATION_IDS.values():
            continue

        for api_field, pollutant in POLLUTANT_MAP.items():
            pollutant_id, pollutant_name, pollutant_eng_name, unit = pollutant
            raw_value = record.get(api_field)
            raw_text = None if raw_value is None else str(raw_value).strip()
            concentration_numeric = parse_concentration(raw_text)
            data_quality = "good" if concentration_numeric is not None else "invalid"

            rows.append((
                station_id,
                monitor_date,
                pollutant_id,
                pollutant_name,
                pollutant_eng_name,
                unit,
                raw_text,
                concentration_numeric,
                data_quality,
                monitor_date,
                monitor_date + timedelta(minutes=59),
            ))

    return rows


def upsert_realtime_rows(conn, rows: list) -> int:
    """寫入 realtime 資料；只更新既有 realtime，不覆蓋 history。"""
    if not rows:
        return 0

    ensure_moe_partitions(conn, [row[1] for row in rows])
    with conn.cursor() as cursor:
        execute_batch(cursor, UPSERT_SQL, rows, page_size=500)
    conn.commit()
    return len(rows)


def main():
    print("=" * 60)
    print("MOE 即時資料入庫工具")
    print("=" * 60)

    if not MOE_API_KEY:
        print("[ERROR] 缺少 MOE_API_KEY 或 NEXT_PUBLIC_MOE_API_KEY")
        sys.exit(1)

    conn = connect_db()
    if not conn:
        sys.exit(1)

    try:
        ensure_moe_hourly_schema(conn)
        ensure_moe_station_names(conn)

        records = []
        for station_name in TARGET_STATIONS:
            print(f"[INFO] 抓取 {station_name} 即時資料")
            station_records = fetch_moe_station(station_name)
            print(f"       取得 {len(station_records)} 筆")
            records.extend(station_records)

        rows = build_rows(records)
        total = upsert_realtime_rows(conn, rows)
        valid = sum(1 for row in rows if row[8] == "good")
        invalid = total - valid

        print(f"[OK] 即時資料入庫完成：{total:,} 筆（有效 {valid:,}，無效 {invalid:,}）")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
