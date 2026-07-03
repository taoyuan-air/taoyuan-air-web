"""
Feature engineering for station time-series imputation.

The default arguments keep the original PM2.5 pipeline compatible while also
supporting independent CWA variables.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

from config import VARIABLES


LAG_HOURS = VARIABLES['pm25']['lag_hours']
TARGET_COL = VARIABLES['pm25']['value_col']
FEATURE_COLS = (
    [f'lag_{h}h' for h in LAG_HOURS]
    + ['hour', 'weekday', 'month']
    + ['sin_hour', 'cos_hour', 'sin_month', 'cos_month', 'sin_weekday', 'cos_weekday']
    + ['latitude', 'longitude']
    + ['neighbor1_lag_1h', 'neighbor1_lag_24h', 'neighbor2_lag_1h', 'neighbor2_lag_24h']
    + ['rolling_mean_3h', 'rolling_mean_6h', 'rolling_std_6h']
)


def find_nearest_stations(station_meta: pd.DataFrame, n: int = 2) -> dict:
    """Return nearest station ids for each station based on lat/lon."""
    coords_km = np.column_stack([
        station_meta['latitude'].values * 111.0,
        station_meta['longitude'].values * 101.0,
    ])
    tree = cKDTree(coords_km)
    k = min(n + 1, len(station_meta))
    _, idxs = tree.query(coords_km, k=k)
    if idxs.ndim == 1:
        idxs = idxs.reshape(-1, 1)

    sids = station_meta['station_id'].values
    return {
        sid: [sids[j] for j in idxs[i] if sids[j] != sid][:n]
        for i, sid in enumerate(sids)
    }


def feature_columns(variable: str = 'pm25', target_col: str | None = None) -> list[str]:
    config = VARIABLES[variable]
    lag_hours = config['lag_hours']
    cols = [f'lag_{h}h' for h in lag_hours]
    cols += ['hour', 'weekday', 'month']
    cols += ['sin_hour', 'cos_hour', 'sin_month', 'cos_month', 'sin_weekday', 'cos_weekday']
    cols += ['latitude', 'longitude']
    if config.get('use_altitude'):
        cols.append('altitude')
    if config.get('use_rain_flag'):
        cols.append('is_raining')

    neighbor_lags = [1, 24] if 24 in lag_hours else [1, lag_hours[-1]]
    for i in (1, 2):
        for h in neighbor_lags:
            cols.append(f'neighbor{i}_lag_{h}h')

    cols += ['rolling_mean_3h', 'rolling_mean_6h', 'rolling_std_6h']
    return cols


def add_features(
    df: pd.DataFrame,
    variable: str = 'pm25',
    target_col: str | None = None,
) -> pd.DataFrame:
    """Add lag, rolling, calendar, spatial, and neighbor-lag features."""
    config = VARIABLES[variable]
    target_col = target_col or config['value_col']
    lag_hours = config['lag_hours']

    df = df.sort_values(['station_id', 'monitor_date']).copy()
    df['monitor_date'] = pd.to_datetime(df['monitor_date'])
    df[target_col] = pd.to_numeric(df[target_col], errors='coerce')
    df = df.dropna(subset=[target_col, 'latitude', 'longitude'])

    if config.get('use_altitude'):
        df['altitude'] = pd.to_numeric(df['altitude'], errors='coerce').fillna(0.0)
    if config.get('use_rain_flag'):
        df['is_raining'] = df.get('is_raining', 0).fillna(0).astype(int)

    df = _add_rolling_stats(df, target_col)

    for h in lag_hours:
        lagged = df[['station_id', 'monitor_date', target_col]].copy()
        lagged['monitor_date'] = lagged['monitor_date'] + pd.Timedelta(hours=h)
        lagged = lagged.rename(columns={target_col: f'lag_{h}h'})
        df = df.merge(lagged, on=['station_id', 'monitor_date'], how='left')

    dt = df['monitor_date']
    df['hour'] = dt.dt.hour
    df['weekday'] = dt.dt.weekday
    df['month'] = dt.dt.month
    df['sin_hour'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['cos_hour'] = np.cos(2 * np.pi * df['hour'] / 24)
    df['sin_month'] = np.sin(2 * np.pi * df['month'] / 12)
    df['cos_month'] = np.cos(2 * np.pi * df['month'] / 12)
    df['sin_weekday'] = np.sin(2 * np.pi * df['weekday'] / 7)
    df['cos_weekday'] = np.cos(2 * np.pi * df['weekday'] / 7)

    df = df.dropna(subset=[f'lag_{h}h' for h in lag_hours])

    neighbor_lags = [1, 24] if 24 in lag_hours else [1, lag_hours[-1]]
    df = _add_neighbor_lag(df, lag_hours=neighbor_lags, n=2)

    return df


def _add_rolling_stats(df: pd.DataFrame, target_col: str) -> pd.DataFrame:
    df = df.copy()
    df['rolling_mean_3h'] = np.nan
    df['rolling_mean_6h'] = np.nan
    df['rolling_std_6h'] = np.nan

    for _, grp in df.groupby('station_id', sort=False):
        shifted = grp[target_col].shift(1)
        df.loc[grp.index, 'rolling_mean_3h'] = shifted.rolling(3, min_periods=1).mean().values
        df.loc[grp.index, 'rolling_mean_6h'] = shifted.rolling(6, min_periods=1).mean().values
        df.loc[grp.index, 'rolling_std_6h'] = (
            shifted.rolling(6, min_periods=2).std().fillna(0.0).values
        )
    return df


def _add_neighbor_lag(
    df: pd.DataFrame,
    lag_hours: list[int] | None = None,
    n: int = 2,
) -> pd.DataFrame:
    lag_hours = lag_hours or [1, 24]
    lag_cols = [f'lag_{h}h' for h in lag_hours]
    station_meta = (
        df.groupby('station_id')[['latitude', 'longitude']]
        .first()
        .reset_index()
    )
    neighbors = find_nearest_stations(station_meta, n=n)
    lag_lookup = df[['station_id', 'monitor_date'] + lag_cols].copy()

    for i in range(1, n + 1):
        nbr_map = pd.DataFrame([
            {'station_id': sid, 'neighbor_id': nbrs[i - 1]}
            for sid, nbrs in neighbors.items()
            if len(nbrs) >= i
        ])
        out_cols = {col: col.replace('lag_', f'neighbor{i}_lag_') for col in lag_cols}

        if nbr_map.empty:
            for col in out_cols.values():
                df[col] = np.nan
            continue

        temp = df[['station_id', 'monitor_date']].merge(nbr_map, on='station_id', how='left')
        nbr_lags = lag_lookup.rename(columns={'station_id': 'neighbor_id', **out_cols})
        result = temp.merge(nbr_lags, on=['neighbor_id', 'monitor_date'], how='left')

        df = df.copy()
        for col in out_cols.values():
            df[col] = result[col].values

    return df
