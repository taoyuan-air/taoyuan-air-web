"""
Feature engineering for PM2.5 imputation.

Adds per-station lag features, cyclic calendar features, neighbor lag
features, and rolling statistics.

Input DataFrame must have columns:
    station_id, monitor_date, pm25, latitude, longitude
"""

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree


# Steps 10: extended lag window to capture 3-12h pollution dynamics
LAG_HOURS = [1, 2, 3, 6, 12, 24]

# Steps 10-13: expanded feature set
FEATURE_COLS = (
    ['lag_1h', 'lag_2h', 'lag_3h', 'lag_6h', 'lag_12h', 'lag_24h']
    + ['hour', 'weekday', 'month']
    + ['sin_hour', 'cos_hour', 'sin_month', 'cos_month', 'sin_weekday', 'cos_weekday']
    + ['latitude', 'longitude']
    + ['neighbor1_lag_1h', 'neighbor1_lag_24h', 'neighbor2_lag_1h', 'neighbor2_lag_24h']
    + ['rolling_mean_3h', 'rolling_mean_6h', 'rolling_std_6h']
)

TARGET_COL = 'pm25'


def find_nearest_stations(station_meta: pd.DataFrame, n: int = 2) -> dict:
    """
    Return {station_id: [neighbor1_id, neighbor2_id, ...]} for the n nearest
    neighbors of each station.

    Parameters
    ----------
    station_meta : DataFrame with columns station_id, latitude, longitude
                   (one unique row per station)
    n            : number of neighbors to find per station
    """
    coords_km = np.column_stack([
        station_meta['latitude'].values  * 111.0,
        station_meta['longitude'].values * 101.0,
    ])
    tree = cKDTree(coords_km)
    k = min(n + 1, len(station_meta))  # +1 to skip self
    _, idxs = tree.query(coords_km, k=k)
    if idxs.ndim == 1:
        idxs = idxs.reshape(-1, 1)

    sids = station_meta['station_id'].values
    result = {}
    for i, sid in enumerate(sids):
        nbrs = [sids[j] for j in idxs[i] if sids[j] != sid][:n]
        result[sid] = nbrs
    return result


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Return df with lag, cyclic calendar, neighbor lag, and rolling features.

    Steps applied in order:
      1. Rolling stats (computed on full pm25 series before lag dropna)
      2. Lag features per station
      3. Calendar + cyclic encodings
      4. Drop rows with missing lags
      5. Neighbor lag features (requires lag values to be present)
    """
    df = df.sort_values(['station_id', 'monitor_date']).copy()
    df['monitor_date'] = pd.to_datetime(df['monitor_date'])

    # Step 1 — rolling stats on the full series (shift(1) avoids leakage)
    df = _add_rolling_stats(df)

    # Step 2 — exact timestamp lags per station
    for h in LAG_HOURS:
        lagged = df[['station_id', 'monitor_date', 'pm25']].copy()
        lagged['monitor_date'] = lagged['monitor_date'] + pd.Timedelta(hours=h)
        lagged = lagged.rename(columns={'pm25': f'lag_{h}h'})
        df = df.merge(lagged, on=['station_id', 'monitor_date'], how='left')

    # Step 3 — calendar + cyclic encodings
    dt = df['monitor_date']
    df['hour']    = dt.dt.hour
    df['weekday'] = dt.dt.weekday
    df['month']   = dt.dt.month

    df['sin_hour']    = np.sin(2 * np.pi * df['hour']    / 24)
    df['cos_hour']    = np.cos(2 * np.pi * df['hour']    / 24)
    df['sin_month']   = np.sin(2 * np.pi * df['month']   / 12)
    df['cos_month']   = np.cos(2 * np.pi * df['month']   / 12)
    df['sin_weekday'] = np.sin(2 * np.pi * df['weekday'] / 7)
    df['cos_weekday'] = np.cos(2 * np.pi * df['weekday'] / 7)

    # Step 4 — remove rows where any lag is unavailable
    df = df.dropna(subset=[f'lag_{h}h' for h in LAG_HOURS])

    # Step 5 — neighbor lag features (uses lag values that now exist)
    df = _add_neighbor_lag(df, n=2)

    return df


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _add_rolling_stats(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add per-station rolling statistics using shift(1) to avoid data leakage.

    Columns added:
        rolling_mean_3h  — mean of pm25 at t-1, t-2, t-3
        rolling_mean_6h  — mean of pm25 at t-1 … t-6
        rolling_std_6h   — std  of pm25 at t-1 … t-6 (0 when < 2 values)
    """
    df = df.copy()
    df['rolling_mean_3h'] = np.nan
    df['rolling_mean_6h'] = np.nan
    df['rolling_std_6h']  = np.nan

    for sid, grp in df.groupby('station_id', sort=False):
        shifted = grp['pm25'].shift(1)
        df.loc[grp.index, 'rolling_mean_3h'] = (
            shifted.rolling(3, min_periods=1).mean().values
        )
        df.loc[grp.index, 'rolling_mean_6h'] = (
            shifted.rolling(6, min_periods=1).mean().values
        )
        df.loc[grp.index, 'rolling_std_6h'] = (
            shifted.rolling(6, min_periods=2).std().fillna(0.0).values
        )

    return df


def _add_neighbor_lag(df: pd.DataFrame, n: int = 2) -> pd.DataFrame:
    """
    Add neighbor station lag values: neighbor{k}_lag_1h, neighbor{k}_lag_24h.

    For each station the n spatially nearest stations are identified.
    Their lag values at the same timestamp are merged in.
    """
    station_meta = (
        df.groupby('station_id')[['latitude', 'longitude']]
        .first()
        .reset_index()
    )
    neighbors = find_nearest_stations(station_meta, n=n)

    lag_lookup = df[['station_id', 'monitor_date', 'lag_1h', 'lag_24h']].copy()

    for i in range(1, n + 1):
        col_1h  = f'neighbor{i}_lag_1h'
        col_24h = f'neighbor{i}_lag_24h'

        nbr_map = pd.DataFrame([
            {'station_id': sid, 'neighbor_id': nbrs[i - 1]}
            for sid, nbrs in neighbors.items()
            if len(nbrs) >= i
        ])

        if nbr_map.empty:
            df[col_1h]  = np.nan
            df[col_24h] = np.nan
            continue

        # (station_id, monitor_date) → neighbor_id → neighbor lag values
        temp = df[['station_id', 'monitor_date']].merge(
            nbr_map, on='station_id', how='left'
        )
        nbr_lags = lag_lookup.rename(columns={
            'station_id': 'neighbor_id',
            'lag_1h':  col_1h,
            'lag_24h': col_24h,
        })
        result = temp.merge(nbr_lags, on=['neighbor_id', 'monitor_date'], how='left')

        df = df.copy()
        df[col_1h]  = result[col_1h].values
        df[col_24h] = result[col_24h].values

    return df
