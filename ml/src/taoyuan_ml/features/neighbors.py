import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

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

def _neighbor_lag_hours(lag_hours: list[int]) -> list[int]:
    return [1, 24] if 24 in lag_hours else [1, lag_hours[-1]]

def _add_station_neighbor_lags(stations: pd.DataFrame, lag_hours: list[int]) -> pd.DataFrame:
    meta = pd.DataFrame({
        'station_id': stations.index,
        'latitude': stations['latitude'].values,
        'longitude': stations['longitude'].values,
    })
    neighbors = find_nearest_stations(meta, n=2)
    stations = stations.copy()
    neighbor_lags = _neighbor_lag_hours(lag_hours)

    for i in range(1, 3):
        for h in neighbor_lags:
            stations[f'neighbor{i}_lag_{h}h'] = np.nan
        for sid, nbrs in neighbors.items():
            if len(nbrs) < i:
                continue
            nbr = nbrs[i - 1]
            if nbr in stations.index:
                for h in neighbor_lags:
                    stations.loc[sid, f'neighbor{i}_lag_{h}h'] = stations.loc[nbr, f'lag_{h}h']

    return stations

def _add_grid_neighbor_lags(
    grid: pd.DataFrame,
    stations: pd.DataFrame,
    lag_hours: list[int],
) -> pd.DataFrame:
    grid = grid.copy()
    st_km = np.column_stack([
        stations['latitude'].values * 111.0,
        stations['longitude'].values * 101.0,
    ])
    grid_km = np.column_stack([
        grid['latitude'].values * 111.0,
        grid['longitude'].values * 101.0,
    ])
    tree = cKDTree(st_km)
    k = min(2, len(stations))
    _, idxs = tree.query(grid_km, k=k)
    if idxs.ndim == 1:
        idxs = idxs.reshape(-1, 1)

    for i in range(2):
        col_idx = min(i, k - 1)
        for h in _neighbor_lag_hours(lag_hours):
            grid[f'neighbor{i + 1}_lag_{h}h'] = stations[f'lag_{h}h'].values[idxs[:, col_idx]]

    return grid
