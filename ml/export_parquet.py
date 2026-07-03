"""
Export training data from PostgreSQL to Parquet.

Examples:
    python export_parquet.py
    python export_parquet.py --variable temperature
    python export_parquet.py --all
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pandas as pd
import psycopg2

from config import DB_CONFIG, EXPORTS_DIR, VARIABLES


PM25_QUERY = """
SELECT
    h.station_id,
    s.station_name,
    'moe' AS source,
    s.latitude,
    s.longitude,
    NULL::numeric AS altitude,
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
    'tydep' AS source,
    s.latitude,
    s.longitude,
    NULL::numeric AS altitude,
    h.monitor_date,
    h.concentration_numeric AS pm25
FROM tydep_hourly_data h
JOIN tydep_stations s ON s.station_id = h.station_id
WHERE h.pollutant_eng_name = 'PM2.5'
  AND h.concentration_numeric IS NOT NULL
  AND h.data_quality = 'good'

ORDER BY monitor_date, station_id
"""


CWA_QUERIES = {
    'temperature': """
        SELECT
            s.station_id,
            s.station_name,
            'cwa' AS source,
            s.latitude,
            s.longitude,
            s.altitude,
            h.monitor_date,
            h.concentration_numeric AS temperature
        FROM cwa_stations s
        JOIN cwa_hourly_data h ON s.station_id = h.station_id
        WHERE h.observation_id = 'TX01'
          AND h.concentration_numeric IS NOT NULL
          AND h.concentration_numeric BETWEEN -30 AND 60
          AND h.data_quality = 'good'
        ORDER BY h.monitor_date, s.station_id
    """,
    'humidity': """
        SELECT
            s.station_id,
            s.station_name,
            'cwa' AS source,
            s.latitude,
            s.longitude,
            s.altitude,
            r.monitor_date,
            r.concentration_numeric AS humidity,
            CASE WHEN COALESCE(p.concentration_numeric, 0) > 0 THEN 1 ELSE 0 END AS is_raining
        FROM cwa_stations s
        JOIN cwa_hourly_data r
          ON r.station_id = s.station_id
         AND r.observation_id = 'RH01'
        LEFT JOIN cwa_hourly_data p
          ON p.station_id = s.station_id
         AND p.monitor_date = r.monitor_date
         AND p.observation_id = 'PP01'
        WHERE r.concentration_numeric IS NOT NULL
          AND r.concentration_numeric BETWEEN 0 AND 100
          AND r.data_quality = 'good'
        ORDER BY r.monitor_date, s.station_id
    """,
    'wind_speed': """
        SELECT
            s.station_id,
            s.station_name,
            'cwa' AS source,
            s.latitude,
            s.longitude,
            s.altitude,
            h.monitor_date,
            h.concentration_numeric AS wind_speed
        FROM cwa_stations s
        JOIN cwa_hourly_data h ON s.station_id = h.station_id
        WHERE h.observation_id = 'WD01'
          AND h.concentration_numeric IS NOT NULL
          AND h.concentration_numeric BETWEEN 0 AND 75
          AND h.data_quality = 'good'
        ORDER BY h.monitor_date, s.station_id
    """,
    'wind_direction': """
        SELECT
            s.station_id,
            s.station_name,
            'cwa' AS source,
            s.latitude,
            s.longitude,
            s.altitude,
            h.monitor_date,
            h.concentration_numeric AS wind_direction,
            SIN(RADIANS(h.concentration_numeric)) AS wind_dir_sin,
            COS(RADIANS(h.concentration_numeric)) AS wind_dir_cos
        FROM cwa_stations s
        JOIN cwa_hourly_data h ON s.station_id = h.station_id
        WHERE h.observation_id = 'WD02'
          AND h.concentration_numeric IS NOT NULL
          AND h.concentration_numeric >= 0
          AND h.concentration_numeric < 360
          AND h.data_quality = 'good'
        ORDER BY h.monitor_date, s.station_id
    """,
}


def query_for(variable: str) -> str:
    if variable == 'pm25':
        return PM25_QUERY
    try:
        return CWA_QUERIES[variable]
    except KeyError as exc:
        raise ValueError(f"Unsupported variable: {variable}") from exc


def export_variable(variable: str) -> pd.DataFrame:
    config = VARIABLES[variable]
    print(f"Connecting to database for {variable}...")
    conn = psycopg2.connect(**DB_CONFIG)

    print(f"Querying {variable} data...")
    df = pd.read_sql(query_for(variable), conn, parse_dates=['monitor_date'])
    conn.close()

    if df.empty:
        raise RuntimeError(f"No rows exported for {variable}")

    value_col = config['value_col']
    print(
        f"  {len(df):,} rows | {df['station_id'].nunique()} stations | "
        f"{df['monitor_date'].min()} ~ {df['monitor_date'].max()}"
    )
    print(f"  {value_col}: {df[value_col].min():.3f} ~ {df[value_col].max():.3f}")

    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out = EXPORTS_DIR / config['parquet']
    df.to_parquet(out, index=False)
    print(f"  Saved {out} ({out.stat().st_size / 1e6:.1f} MB)")
    return df


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export imputation training data.")
    parser.add_argument(
        '--variable',
        choices=sorted(VARIABLES),
        default='pm25',
        help="Variable to export. Defaults to pm25 for backward compatibility.",
    )
    parser.add_argument('--all', action='store_true', help="Export all variables.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    variables = list(VARIABLES) if args.all else [args.variable]
    for variable in variables:
        export_variable(variable)


if __name__ == '__main__':
    main()
