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

import numpy as np
import pandas as pd
import psycopg2
from scipy.spatial import cKDTree

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
    'pressure': """
        SELECT
            s.station_id,
            s.station_name,
            'cwa' AS source,
            s.latitude,
            s.longitude,
            s.altitude,
            h.monitor_date,
            h.concentration_numeric AS pressure
        FROM cwa_stations s
        JOIN cwa_hourly_data h ON s.station_id = h.station_id
        WHERE h.observation_id = 'PS01'
          AND h.concentration_numeric IS NOT NULL
          AND h.concentration_numeric BETWEEN 800 AND 1100
          AND h.data_quality = 'good'
        ORDER BY h.monitor_date, s.station_id
    """,
}


CWA_METEO_WIDE_QUERY = """
SELECT
    s.station_id AS cwa_station_id,
    s.latitude AS cwa_latitude,
    s.longitude AS cwa_longitude,
    h.monitor_date,
    MAX(CASE WHEN h.observation_id = 'TX01' THEN h.concentration_numeric END) AS temperature,
    MAX(CASE WHEN h.observation_id = 'RH01' THEN h.concentration_numeric END) AS humidity,
    MAX(CASE WHEN h.observation_id = 'WD01' THEN h.concentration_numeric END) AS wind_speed,
    MAX(CASE WHEN h.observation_id = 'WD02' THEN h.concentration_numeric END) AS wind_direction,
    MAX(CASE WHEN h.observation_id = 'PS01' THEN h.concentration_numeric END) AS pressure
FROM cwa_stations s
JOIN cwa_hourly_data h ON s.station_id = h.station_id
WHERE h.observation_id IN ('TX01', 'RH01', 'WD01', 'WD02', 'PS01')
  AND h.concentration_numeric IS NOT NULL
  AND h.data_quality = 'good'
GROUP BY s.station_id, s.latitude, s.longitude, h.monitor_date
ORDER BY h.monitor_date, s.station_id
"""


def query_for(variable: str) -> str:
    if variable == 'pm25':
        return PM25_QUERY
    try:
        return CWA_QUERIES[variable]
    except KeyError as exc:
        raise ValueError(f"Unsupported variable: {variable}") from exc


def _nearest_cwa_station_map(pm25_df: pd.DataFrame, meteo_df: pd.DataFrame) -> pd.DataFrame:
    pm_stations = (
        pm25_df.groupby('station_id')[['latitude', 'longitude']]
        .first()
        .reset_index()
    )
    cwa_stations = (
        meteo_df.groupby('cwa_station_id')[['cwa_latitude', 'cwa_longitude']]
        .first()
        .dropna()
        .reset_index()
    )
    if pm_stations.empty or cwa_stations.empty:
        return pd.DataFrame(columns=['station_id', 'cwa_station_id'])

    cwa_coords = np.column_stack([
        cwa_stations['cwa_latitude'].to_numpy(dtype=float) * 111.0,
        cwa_stations['cwa_longitude'].to_numpy(dtype=float) * 101.0,
    ])
    pm_coords = np.column_stack([
        pm_stations['latitude'].to_numpy(dtype=float) * 111.0,
        pm_stations['longitude'].to_numpy(dtype=float) * 101.0,
    ])
    _, idxs = cKDTree(cwa_coords).query(pm_coords, k=1)
    pm_stations['cwa_station_id'] = cwa_stations['cwa_station_id'].values[idxs]
    return pm_stations[['station_id', 'cwa_station_id']]


def _add_pm25_meteo_features(conn, df: pd.DataFrame) -> pd.DataFrame:
    print("  Querying nearest CWA meteorological features for PM2.5...")
    meteo = pd.read_sql(CWA_METEO_WIDE_QUERY, conn, parse_dates=['monitor_date'])
    if meteo.empty:
        print("  [WARN] No CWA meteo rows found; PM2.5 external features will be missing.")
        return df

    mapping = _nearest_cwa_station_map(df, meteo)
    if mapping.empty:
        print("  [WARN] No station mapping produced; PM2.5 external features will be missing.")
        return df

    wind_rad = np.deg2rad(pd.to_numeric(meteo['wind_direction'], errors='coerce'))
    wind_speed = pd.to_numeric(meteo['wind_speed'], errors='coerce')
    # WD02 is meteorological wind direction (where wind comes from).
    # Convert to standard eastward/northward components.
    meteo['wind_u'] = -wind_speed * np.sin(wind_rad)
    meteo['wind_v'] = -wind_speed * np.cos(wind_rad)

    meteo_cols = [
        'cwa_station_id',
        'monitor_date',
        'temperature',
        'humidity',
        'wind_speed',
        'wind_u',
        'wind_v',
        'pressure',
    ]
    out = df.merge(mapping, on='station_id', how='left')
    out = out.merge(meteo[meteo_cols], on=['cwa_station_id', 'monitor_date'], how='left')
    missing = out[['temperature', 'humidity', 'wind_speed', 'wind_u', 'wind_v', 'pressure']].isna().mean()
    print("  PM2.5 meteo missing ratio:")
    for col, ratio in missing.items():
        print(f"    {col}: {ratio:.2%}")
    return out


def export_variable(variable: str) -> pd.DataFrame:
    config = VARIABLES[variable]
    print(f"Connecting to database for {variable}...")
    conn = psycopg2.connect(**DB_CONFIG)

    print(f"Querying {variable} data...")
    df = pd.read_sql(query_for(variable), conn, parse_dates=['monitor_date'])
    if variable == 'pm25':
        df = _add_pm25_meteo_features(conn, df)
    conn.close()

    if df.empty:
        raise RuntimeError(f"No rows exported for {variable}")

    value_col = config['value_col']
    print(
        f"  {len(df):,} rows | {df['station_id'].nunique()} stations | "
        f"{df['monitor_date'].min()} ~ {df['monitor_date'].max()}"
    )
    print(f"  raw shape: {df.shape}")
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
