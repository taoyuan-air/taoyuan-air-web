"""
Stage 2: Two-stage grid prediction for a given timestamp.

  Final[grid] = XGBoost_trend[grid] + Kriging_residual[grid]

Usage:
    cd ml
    python -m impute.predict --time "2024-01-15 14:00"

Output:
    data/exports/grid_pm25_<timestamp>.parquet
    Columns: latitude, longitude,
             pm25_xgb, pm25_kriging, pm25_kriging_variance, pm25_final,
             nearest_station_distance,
             station_count_within_3km, station_count_within_5km, station_count_within_10km,
             mean_distance_to_3_nearest, confidence_level
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
from pykrige.ok import OrdinaryKriging
from scipy.spatial import cKDTree
from xgboost import XGBRegressor

from config import (
    EXPORTS_DIR,
    GRID_RESOLUTION,
    MODELS_DIR,
    TAOYUAN_BBOX,
    XGB_PARAMS,
)
from impute.features import FEATURE_COLS, LAG_HOURS, find_nearest_stations
from impute.uncertainty import assign_confidence_level, compute_spatial_uncertainty

# Hours beyond LAG_HOURS needed to fill the 6h rolling window (t-4, t-5)
_ROLLING_EXTRA_HOURS = [4, 5]
_ALL_NEEDED_HOURS = sorted(set([0] + LAG_HOURS + _ROLLING_EXTRA_HOURS))


def load_model() -> XGBRegressor:
    path = MODELS_DIR / 'xgb_pm25.json'
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}\nRun ml/impute/train.py first.")
    model = XGBRegressor(**XGB_PARAMS)
    model.load_model(path)
    return model


def load_station_data() -> pd.DataFrame:
    path = EXPORTS_DIR / 'pm25_hourly.parquet'
    if not path.exists():
        raise FileNotFoundError(f"Parquet not found: {path}\nRun ml/export_parquet.py first.")
    return pd.read_parquet(path)


def build_grid() -> pd.DataFrame:
    lats = np.arange(TAOYUAN_BBOX['lat_min'], TAOYUAN_BBOX['lat_max'], GRID_RESOLUTION)
    lons = np.arange(TAOYUAN_BBOX['lon_min'], TAOYUAN_BBOX['lon_max'], GRID_RESOLUTION)
    lat_grid, lon_grid = np.meshgrid(lats, lons)
    return pd.DataFrame({
        'latitude':  lat_grid.ravel(),
        'longitude': lon_grid.ravel(),
    })


def _idw_lag(grid: pd.DataFrame, stations: pd.DataFrame, col: str,
             power: float = 2.0) -> np.ndarray:
    """Estimate a station column at grid points via inverse-distance weighting."""
    result = np.zeros(len(grid))
    for i, row in grid.iterrows():
        d2 = (stations['latitude'] - row['latitude']) ** 2 + \
             (stations['longitude'] - row['longitude']) ** 2
        d  = np.sqrt(d2).clip(1e-6)
        w  = 1.0 / d ** power
        result[i] = (w * stations[col]).sum() / w.sum()
    return result


def _add_station_rolling_stats(
    stations: pd.DataFrame,
    window: pd.DataFrame,
    target_time: pd.Timestamp,
) -> pd.DataFrame:
    """
    Compute rolling statistics per station at target_time from window data.

    Adds columns: rolling_mean_3h, rolling_mean_6h, rolling_std_6h
    Uses pm25 at t-1 … t-6 (same shift-1 convention as training).
    """
    stations = stations.copy()
    stations['rolling_mean_3h'] = np.nan
    stations['rolling_mean_6h'] = np.nan
    stations['rolling_std_6h']  = np.nan

    for sid in stations.index:
        pm25_6h = []
        for h in range(1, 7):
            t_h  = target_time - pd.Timedelta(hours=h)
            mask = (window['station_id'] == sid) & (window['monitor_date'] == t_h)
            v    = window.loc[mask, 'pm25'].values
            pm25_6h.append(float(v[0]) if len(v) > 0 else np.nan)

        arr    = np.array(pm25_6h, dtype=float)
        v3     = arr[:3][~np.isnan(arr[:3])]
        v6     = arr[~np.isnan(arr)]
        stations.loc[sid, 'rolling_mean_3h'] = np.mean(v3) if len(v3) > 0 else np.nan
        stations.loc[sid, 'rolling_mean_6h'] = np.mean(v6) if len(v6) > 0 else np.nan
        stations.loc[sid, 'rolling_std_6h']  = (
            float(np.std(v6, ddof=1)) if len(v6) >= 2 else 0.0
        )

    return stations


def _add_station_neighbor_lags(stations: pd.DataFrame) -> pd.DataFrame:
    """
    For each station, look up the lag_1h and lag_24h of its 2 nearest neighbors.

    Adds columns: neighbor1_lag_1h, neighbor1_lag_24h,
                  neighbor2_lag_1h, neighbor2_lag_24h
    """
    meta = pd.DataFrame({
        'station_id': stations.index,
        'latitude':   stations['latitude'].values,
        'longitude':  stations['longitude'].values,
    })
    neighbors = find_nearest_stations(meta, n=2)
    stations  = stations.copy()

    for i in range(1, 3):
        col_1h  = f'neighbor{i}_lag_1h'
        col_24h = f'neighbor{i}_lag_24h'
        stations[col_1h]  = np.nan
        stations[col_24h] = np.nan
        for sid, nbrs in neighbors.items():
            if len(nbrs) < i:
                continue
            nbr = nbrs[i - 1]
            if nbr in stations.index:
                stations.loc[sid, col_1h]  = stations.loc[nbr, 'lag_1h']
                stations.loc[sid, col_24h] = stations.loc[nbr, 'lag_24h']

    return stations


def _add_grid_neighbor_lags(grid: pd.DataFrame, st: pd.DataFrame) -> pd.DataFrame:
    """
    Assign each grid point the lag_1h / lag_24h of its 2 nearest stations.

    Adds columns: neighbor1_lag_1h, neighbor1_lag_24h,
                  neighbor2_lag_1h, neighbor2_lag_24h
    """
    grid = grid.copy()
    st_km = np.column_stack([
        st['latitude'].values  * 111.0,
        st['longitude'].values * 101.0,
    ])
    grid_km = np.column_stack([
        grid['latitude'].values  * 111.0,
        grid['longitude'].values * 101.0,
    ])
    tree = cKDTree(st_km)
    k    = min(2, len(st))
    _, idxs = tree.query(grid_km, k=k)
    if idxs.ndim == 1:
        idxs = idxs.reshape(-1, 1)

    for i in range(2):
        col_idx = min(i, k - 1)
        grid[f'neighbor{i+1}_lag_1h']  = st['lag_1h'].values[idxs[:, col_idx]]
        grid[f'neighbor{i+1}_lag_24h'] = st['lag_24h'].values[idxs[:, col_idx]]

    return grid


def _build_time_features(df: pd.DataFrame, t: pd.Timestamp) -> pd.DataFrame:
    """Add scalar calendar + cyclic columns derived from timestamp t."""
    df = df.copy()
    df['hour']        = t.hour
    df['weekday']     = t.weekday()
    df['month']       = t.month
    df['sin_hour']    = np.sin(2 * np.pi * t.hour       / 24)
    df['cos_hour']    = np.cos(2 * np.pi * t.hour       / 24)
    df['sin_month']   = np.sin(2 * np.pi * t.month      / 12)
    df['cos_month']   = np.cos(2 * np.pi * t.month      / 12)
    df['sin_weekday'] = np.sin(2 * np.pi * t.weekday()  / 7)
    df['cos_weekday'] = np.cos(2 * np.pi * t.weekday()  / 7)
    return df


def predict_grid(target_time: pd.Timestamp) -> pd.DataFrame:
    """Return a DataFrame with PM2.5 predictions on the Taoyuan grid."""
    station_df = load_station_data()
    model      = load_model()

    # Load all needed timestamps at once (lags + extra hours for rolling stats)
    needed_times = [target_time - pd.Timedelta(hours=h) for h in _ALL_NEEDED_HOURS]
    window = station_df[station_df['monitor_date'].isin(needed_times)].copy()

    def _val(h):
        t   = target_time - pd.Timedelta(hours=h)
        sub = window[window['monitor_date'] == t][
            ['station_id', 'latitude', 'longitude', 'pm25']
        ]
        return sub.set_index('station_id')

    t_vals = {h: _val(h) for h in _ALL_NEEDED_HOURS}

    # Stations must have complete data for all LAG_HOURS
    common_ids = t_vals[0].index
    for h in LAG_HOURS:
        common_ids = common_ids.intersection(t_vals[h].index)
    if len(common_ids) < 3:
        raise ValueError(
            f"Not enough stations with complete lag data at {target_time} "
            f"(need ≥3, got {len(common_ids)})"
        )

    stations = t_vals[0].loc[common_ids].copy()
    for h in LAG_HOURS:
        stations[f'lag_{h}h'] = t_vals[h].loc[common_ids, 'pm25']

    # Rolling stats per station
    stations = _add_station_rolling_stats(stations, window, target_time)

    # Neighbor lags per station
    stations = _add_station_neighbor_lags(stations)

    st = stations.reset_index()  # station_id becomes a column

    # ----- Build grid features -----
    grid = build_grid()

    # Lag IDW for each lag hour
    for h in LAG_HOURS:
        grid[f'lag_{h}h'] = _idw_lag(grid, st, f'lag_{h}h')

    # Calendar + cyclic features
    grid = _build_time_features(grid, target_time)

    # Neighbor lags at grid points (nearest station assignment)
    grid = _add_grid_neighbor_lags(grid, st)

    # Rolling stats at grid points (IDW from station rolling stats)
    for col in ['rolling_mean_3h', 'rolling_mean_6h', 'rolling_std_6h']:
        grid[col] = _idw_lag(grid, st, col)

    # ----- Stage A: XGBoost trend on grid -----
    grid['pm25_xgb'] = model.predict(grid[FEATURE_COLS])

    # ----- Stage B: Kriging on station residuals -----
    station_features = st.copy()
    station_features = _build_time_features(station_features, target_time)
    station_features['pm25_xgb'] = model.predict(station_features[FEATURE_COLS])
    station_features['residual'] = station_features['pm25'] - station_features['pm25_xgb']

    ok = OrdinaryKriging(
        station_features['longitude'].values,
        station_features['latitude'].values,
        station_features['residual'].values,
        variogram_model='spherical',
        verbose=False,
        enable_plotting=False,
    )
    kriging_correction, kriging_variance = ok.execute(
        'points',
        grid['longitude'].values,
        grid['latitude'].values,
    )

    grid['pm25_kriging']          = kriging_correction
    grid['pm25_kriging_variance'] = np.asarray(kriging_variance)
    grid['pm25_final']            = (grid['pm25_xgb'] + grid['pm25_kriging']).clip(lower=0)

    # ----- Stage C: spatial uncertainty metrics -----
    stations_for_uncertainty = st[['latitude', 'longitude']]
    grid = compute_spatial_uncertainty(grid, stations_for_uncertainty)
    grid = assign_confidence_level(grid)

    return grid[[
        'latitude', 'longitude',
        'pm25_xgb', 'pm25_kriging', 'pm25_kriging_variance', 'pm25_final',
        'nearest_station_distance',
        'station_count_within_3km', 'station_count_within_5km', 'station_count_within_10km',
        'mean_distance_to_3_nearest',
        'confidence_level',
    ]]


def main():
    parser = argparse.ArgumentParser(description='Predict PM2.5 grid for a timestamp')
    parser.add_argument('--time', required=True,
                        help='Target datetime, e.g. "2024-01-15 14:00"')
    args = parser.parse_args()

    target = pd.Timestamp(args.time)
    print(f"Predicting PM2.5 grid for {target} ...")

    result = predict_grid(target)
    print(f"Grid shape: {len(result)} points  "
          f"PM2.5 range: [{result['pm25_final'].min():.1f}, "
          f"{result['pm25_final'].max():.1f}] ug/m3")

    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    fname = f"grid_pm25_{target.strftime('%Y%m%d_%H%M')}.parquet"
    out = EXPORTS_DIR / fname
    result.to_parquet(out, index=False)
    print(f"Saved → {out}")


if __name__ == '__main__':
    main()
