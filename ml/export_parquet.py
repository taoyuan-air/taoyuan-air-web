"""
Export PM2.5 hourly data from PostgreSQL to Parquet.
Merges MOE (6 stations) + TYDEP (4 stations) into a single file.

Output: data/exports/pm25_hourly.parquet
Columns: station_id, station_name, source, latitude, longitude,
         monitor_date, pm25
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pandas as pd
import psycopg2
from config import DB_CONFIG, EXPORTS_DIR

QUERY = """
SELECT
    h.station_id,
    s.station_name,
    'moe'       AS source,
    s.latitude,
    s.longitude,
    h.monitor_date,
    h.concentration_numeric AS pm25
FROM moe_hourly_data h
JOIN moe_stations s ON s.station_id = h.station_id
WHERE h.pollutant_eng_name = 'PM2.5'
  AND h.concentration_numeric IS NOT NULL
  AND h.data_quality = 'good'

UNION ALL

SELECT
    h.station_id,
    s.station_name,
    'tydep'     AS source,
    s.latitude,
    s.longitude,
    h.monitor_date,
    h.concentration_numeric AS pm25
FROM tydep_hourly_data h
JOIN tydep_stations s ON s.station_id = h.station_id
WHERE h.pollutant_eng_name = 'PM2.5'
  AND h.concentration_numeric IS NOT NULL
  AND h.data_quality = 'good'

ORDER BY monitor_date, station_id
"""


def export_pm25() -> pd.DataFrame:
    print("Connecting to database...")
    conn = psycopg2.connect(**DB_CONFIG)

    print("Querying PM2.5 data (this may take a moment)...")
    df = pd.read_sql(QUERY, conn, parse_dates=['monitor_date'])
    conn.close()

    print(f"  {len(df):,} rows | {df['station_id'].nunique()} stations "
          f"| {df['monitor_date'].min().date()} ~ {df['monitor_date'].max().date()}")

    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out = EXPORTS_DIR / 'pm25_hourly.parquet'
    df.to_parquet(out, index=False)
    print(f"  Saved → {out}  ({out.stat().st_size / 1e6:.1f} MB)")

    return df


if __name__ == '__main__':
    export_pm25()
