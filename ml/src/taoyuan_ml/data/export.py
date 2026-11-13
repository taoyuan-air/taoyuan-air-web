"""
Export training data from PostgreSQL to Parquet.

Use the taoyuan-ml entry point; see ml/README.md for commands.
"""

import argparse


import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

from taoyuan_ml.settings import DATASET_DIR, VARIABLES
from .database import connect
from .queries import query_for, CWA_METEO_WIDE_QUERY
from taoyuan_ml.models.artifacts import record_dataset


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
    if (DATASET_DIR / config['parquet']).exists():
        raise FileExistsError('Dataset file already exists; use a new --dataset-id.')
    print(f"Connecting to database for {variable}...")
    with connect() as conn:
        print(f"Querying {variable} data...")
        df = pd.read_sql(query_for(variable), conn, parse_dates=['monitor_date'])
        if variable == 'pm25':
            df = _add_pm25_meteo_features(conn, df)

    if df.empty:
        raise RuntimeError(f"No rows exported for {variable}")

    value_col = config['value_col']
    print(
        f"  {len(df):,} rows | {df['station_id'].nunique()} stations | "
        f"{df['monitor_date'].min()} ~ {df['monitor_date'].max()}"
    )
    print(f"  exported rows: {len(df):,}")
    print(f"  {value_col}: {df[value_col].min():.3f} ~ {df[value_col].max():.3f}")

    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    out = DATASET_DIR / config['parquet']
    df.to_parquet(out, index=False)
    record_dataset(variable, df, out)
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
