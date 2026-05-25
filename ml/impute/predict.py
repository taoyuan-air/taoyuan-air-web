"""
Stage 2: Two-stage grid prediction for a given timestamp.

  Final[grid] = XGBoost_trend[grid] + Kriging_residual[grid]

Usage:
    cd ml
    python -m impute.predict --time "2024-01-15 14:00"

Output:
    data/exports/grid_pm25_<timestamp>.parquet
    Columns: latitude, longitude, pm25_xgb, pm25_kriging, pm25_final
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
from pykrige.ok import OrdinaryKriging
from xgboost import XGBRegressor

from config import (
    EXPORTS_DIR,
    GRID_RESOLUTION,
    MODELS_DIR,
    TAOYUAN_BBOX,
    XGB_PARAMS,
)
from impute.features import FEATURE_COLS, LAG_HOURS, add_features


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


def _idw_lag(grid: pd.DataFrame, stations: pd.DataFrame, lag_col: str, power: float = 2.0) -> np.ndarray:
    """Estimate lag values at grid points using inverse-distance weighting from stations."""
    result = np.zeros(len(grid))
    for i, row in grid.iterrows():
        d2 = (stations['latitude'] - row['latitude']) ** 2 + \
             (stations['longitude'] - row['longitude']) ** 2
        d  = np.sqrt(d2).clip(1e-6)
        w  = 1.0 / d ** power
        result[i] = (w * stations[lag_col]).sum() / w.sum()
    return result


def predict_grid(target_time: pd.Timestamp) -> pd.DataFrame:
    """Return a DataFrame with PM2.5 predictions on the Taoyuan grid."""
    station_df = load_station_data()
    model      = load_model()

    # -- Collect station values at target_time and lag hours --
    needed_times = [target_time - pd.Timedelta(hours=h) for h in [0] + LAG_HOURS]
    window = station_df[station_df['monitor_date'].isin(needed_times)].copy()

    def _station_val(t):
        sub = window[window['monitor_date'] == t][['station_id', 'latitude', 'longitude', 'pm25']]
        return sub.set_index('station_id')

    actual_t  = _station_val(target_time)
    actual_t1 = _station_val(target_time - pd.Timedelta(hours=1))
    actual_t2 = _station_val(target_time - pd.Timedelta(hours=2))
    actual_t24= _station_val(target_time - pd.Timedelta(hours=24))

    common_ids = actual_t.index.intersection(actual_t1.index)\
                                .intersection(actual_t2.index)\
                                .intersection(actual_t24.index)
    if len(common_ids) < 3:
        raise ValueError(f"Not enough stations with complete lag data at {target_time} "
                         f"(need ≥3, got {len(common_ids)})")

    stations = actual_t.loc[common_ids].copy()
    stations['lag_1h']  = actual_t1.loc[common_ids, 'pm25']
    stations['lag_2h']  = actual_t2.loc[common_ids, 'pm25']
    stations['lag_24h'] = actual_t24.loc[common_ids, 'pm25']

    # -- Build grid features --
    grid = build_grid()
    grid['lag_1h']  = _idw_lag(grid, stations.reset_index(), 'lag_1h')
    grid['lag_2h']  = _idw_lag(grid, stations.reset_index(), 'lag_2h')
    grid['lag_24h'] = _idw_lag(grid, stations.reset_index(), 'lag_24h')
    grid['hour']    = target_time.hour
    grid['weekday'] = target_time.weekday()
    grid['month']   = target_time.month
    grid['sin_hour'] = np.sin(2 * np.pi * grid['hour'] / 24)
    grid['cos_hour'] = np.cos(2 * np.pi * grid['hour'] / 24)

    # -- Stage A: XGBoost trend on grid --
    grid['pm25_xgb'] = model.predict(grid[FEATURE_COLS])

    # -- Stage B: Kriging on station residuals --
    # Predict at station locations
    station_features = stations.reset_index().copy()
    station_features['hour']     = target_time.hour
    station_features['weekday']  = target_time.weekday()
    station_features['month']    = target_time.month
    station_features['sin_hour'] = np.sin(2 * np.pi * station_features['hour'] / 24)
    station_features['cos_hour'] = np.cos(2 * np.pi * station_features['hour'] / 24)

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
    kriging_correction, _ = ok.execute(
        'points',
        grid['longitude'].values,
        grid['latitude'].values,
    )

    grid['pm25_kriging'] = kriging_correction
    grid['pm25_final']   = (grid['pm25_xgb'] + grid['pm25_kriging']).clip(lower=0)

    return grid[['latitude', 'longitude', 'pm25_xgb', 'pm25_kriging', 'pm25_final']]


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
