"""
Two-stage grid prediction for imputation variables.

Final[grid] = XGBoost_trend[grid] + Kriging_residual[grid]

Examples:
    cd ml
    python -m impute.predict --variable pm25 --time "2024-01-15 14:00"
    python -m impute.predict --variable pressure --time "2024-01-15 14:00"
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
    VARIABLES,
    XGB_PARAMS,
)
from impute.features import (
    add_time_features,
    feature_columns,
    find_nearest_stations,
    validate_input_columns,
)
from impute.uncertainty import assign_confidence_level, compute_spatial_uncertainty


_ROLLING_EXTRA_HOURS = [4, 5]


def model_name(variable: str, target_col: str) -> str:
    if variable == 'wind_direction':
        suffix = 'sin' if target_col.endswith('_sin') else 'cos'
        return f'xgb_wind_dir_{suffix}.json'
    return f'xgb_{variable}.json'


def load_model(variable: str, target_col: str) -> XGBRegressor:
    path = MODELS_DIR / model_name(variable, target_col)
    if not path.exists():
        raise FileNotFoundError(
            f"Model not found: {path}\nRun ml/impute/train.py --variable {variable} first."
        )
    model = XGBRegressor(**XGB_PARAMS)
    model.load_model(path)
    return model


def load_station_data(variable: str) -> pd.DataFrame:
    path = EXPORTS_DIR / VARIABLES[variable]['parquet']
    if not path.exists():
        raise FileNotFoundError(
            f"Parquet not found: {path}\nRun ml/export_parquet.py --variable {variable} first."
        )
    df = pd.read_parquet(path)
    df['monitor_date'] = pd.to_datetime(df['monitor_date'])
    return df


def _validate_model_features(model: XGBRegressor, variable: str, feature_cols: list[str]) -> None:
    model_features = model.get_booster().feature_names
    if model_features is None or list(model_features) == feature_cols:
        return

    missing_in_model = [col for col in feature_cols if col not in model_features]
    extra_in_model = [col for col in model_features if col not in feature_cols]
    raise RuntimeError(
        f"Model feature schema mismatch for {variable}. "
        f"Retrain with: cd ml && python -m impute.train --variable {variable}. "
        f"Missing in model: {missing_in_model}. Extra in model: {extra_in_model}."
    )


def build_grid() -> pd.DataFrame:
    lats = np.arange(TAOYUAN_BBOX['lat_min'], TAOYUAN_BBOX['lat_max'], GRID_RESOLUTION)
    lons = np.arange(TAOYUAN_BBOX['lon_min'], TAOYUAN_BBOX['lon_max'], GRID_RESOLUTION)
    lat_grid, lon_grid = np.meshgrid(lats, lons)
    return pd.DataFrame({
        'latitude': lat_grid.ravel(),
        'longitude': lon_grid.ravel(),
    })


def _idw(grid: pd.DataFrame, stations: pd.DataFrame, col: str, power: float = 2.0) -> np.ndarray:
    """Estimate a station column at grid points via inverse-distance weighting."""
    vals = pd.to_numeric(stations[col], errors='coerce')
    if vals.isna().all():
        raise ValueError(f"Cannot IDW interpolate {col}: all station values are NaN")
    vals = vals.fillna(vals.mean())

    result = np.zeros(len(grid))
    for i, row in grid.iterrows():
        d2 = (stations['latitude'] - row['latitude']) ** 2 + (
            stations['longitude'] - row['longitude']
        ) ** 2
        d = np.sqrt(d2).clip(1e-6)
        w = 1.0 / d ** power
        result[i] = (w * vals).sum() / w.sum()
    return result


def _add_time_features_for_timestamp(df: pd.DataFrame, target_time: pd.Timestamp) -> pd.DataFrame:
    df = df.copy()
    df['monitor_date'] = target_time
    return add_time_features(df).drop(columns=['monitor_date'])


def _neighbor_lag_hours(lag_hours: list[int]) -> list[int]:
    return [1, 24] if 24 in lag_hours else [1, lag_hours[-1]]


def _add_station_rolling_stats(
    stations: pd.DataFrame,
    window: pd.DataFrame,
    target_time: pd.Timestamp,
    value_col: str,
) -> pd.DataFrame:
    stations = stations.copy()
    stations['rolling_mean_3h'] = np.nan
    stations['rolling_mean_6h'] = np.nan
    stations['rolling_std_6h'] = np.nan

    for sid in stations.index:
        values_6h = []
        for h in range(1, 7):
            t_h = target_time - pd.Timedelta(hours=h)
            mask = (window['station_id'] == sid) & (window['monitor_date'] == t_h)
            values = window.loc[mask, value_col].values
            values_6h.append(float(values[0]) if len(values) > 0 else np.nan)

        arr = np.array(values_6h, dtype=float)
        v3 = arr[:3][~np.isnan(arr[:3])]
        v6 = arr[~np.isnan(arr)]
        stations.loc[sid, 'rolling_mean_3h'] = np.mean(v3) if len(v3) > 0 else np.nan
        stations.loc[sid, 'rolling_mean_6h'] = np.mean(v6) if len(v6) > 0 else np.nan
        stations.loc[sid, 'rolling_std_6h'] = (
            float(np.std(v6, ddof=1)) if len(v6) >= 2 else 0.0
        )

    return stations


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


def _current_value_columns(config: dict, value_col: str) -> list[str]:
    cols = ['station_id', 'latitude', 'longitude', value_col]
    if config.get('use_altitude'):
        cols.append('altitude')
    if config.get('use_rain_flag'):
        cols.append('is_raining')
    cols += config.get('external_features', [])
    return cols


def _clip_final(series: pd.Series, config: dict) -> pd.Series:
    if config.get('clip_min') is not None:
        series = series.clip(lower=config['clip_min'])
    if config.get('clip_max') is not None:
        series = series.clip(upper=config['clip_max'])
    return series


def predict_grid(target_time: pd.Timestamp, variable: str = 'pm25') -> pd.DataFrame:
    """Return a DataFrame with grid predictions for one non-circular variable."""
    config = VARIABLES[variable]
    if config.get('circular'):
        raise NotImplementedError(
            "Grid prediction for circular variables is not implemented yet. "
            "Train wind_direction via sin/cos first, then add circular reconstruction."
        )

    value_col = config['value_col']
    target_col = value_col
    lag_hours = config['lag_hours']
    all_needed_hours = sorted(set([0] + lag_hours + _ROLLING_EXTRA_HOURS))
    feature_cols = feature_columns(variable=variable, target_col=target_col)

    station_df = load_station_data(variable)
    validate_input_columns(station_df, variable=variable, target_col=target_col)
    model = load_model(variable, target_col)
    _validate_model_features(model, variable, feature_cols)

    needed_times = [target_time - pd.Timedelta(hours=h) for h in all_needed_hours]
    window = station_df[station_df['monitor_date'].isin(needed_times)].copy()

    def _values_at(h: int) -> pd.DataFrame:
        t = target_time - pd.Timedelta(hours=h)
        cols = _current_value_columns(config, value_col) if h == 0 else [
            'station_id',
            'latitude',
            'longitude',
            value_col,
        ]
        return window[window['monitor_date'] == t][cols].set_index('station_id')

    t_vals = {h: _values_at(h) for h in all_needed_hours}

    common_ids = t_vals[0].index
    for h in lag_hours:
        common_ids = common_ids.intersection(t_vals[h].index)
    if len(common_ids) < 3:
        raise ValueError(
            f"Not enough stations with complete lag data at {target_time} "
            f"(need >=3, got {len(common_ids)})"
        )

    stations = t_vals[0].loc[common_ids].copy()
    for h in lag_hours:
        stations[f'lag_{h}h'] = t_vals[h].loc[common_ids, value_col]

    stations = _add_station_rolling_stats(stations, window, target_time, value_col)
    stations = _add_station_neighbor_lags(stations, lag_hours)
    station_features = stations.reset_index()

    grid = build_grid()
    for h in lag_hours:
        grid[f'lag_{h}h'] = _idw(grid, station_features, f'lag_{h}h')
    grid = _add_time_features_for_timestamp(grid, target_time)

    if config.get('use_altitude'):
        grid['altitude'] = _idw(grid, station_features, 'altitude')
    if config.get('use_rain_flag'):
        grid['is_raining'] = (_idw(grid, station_features, 'is_raining') >= 0.5).astype(int)
    for col in config.get('external_features', []):
        grid[col] = _idw(grid, station_features, col)

    grid = _add_grid_neighbor_lags(grid, station_features, lag_hours)
    for col in ['rolling_mean_3h', 'rolling_mean_6h', 'rolling_std_6h']:
        grid[col] = _idw(grid, station_features, col)

    xgb_col = f'{variable}_xgb'
    kriging_col = f'{variable}_kriging'
    variance_col = f'{variable}_kriging_variance'
    final_col = f'{variable}_final'

    grid[xgb_col] = model.predict(grid[feature_cols])

    station_features = _add_time_features_for_timestamp(station_features, target_time)
    station_features[xgb_col] = model.predict(station_features[feature_cols])
    station_features['residual'] = station_features[value_col] - station_features[xgb_col]

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

    grid[kriging_col] = kriging_correction
    grid[variance_col] = np.asarray(kriging_variance)
    grid[final_col] = _clip_final(grid[xgb_col] + grid[kriging_col], config)

    stations_for_uncertainty = station_features[['latitude', 'longitude']]
    grid = compute_spatial_uncertainty(grid, stations_for_uncertainty)
    grid = assign_confidence_level(grid)

    return grid[[
        'latitude',
        'longitude',
        xgb_col,
        kriging_col,
        variance_col,
        final_col,
        'nearest_station_distance',
        'station_count_within_3km',
        'station_count_within_5km',
        'station_count_within_10km',
        'mean_distance_to_3_nearest',
        'confidence_level',
    ]]


def main() -> None:
    parser = argparse.ArgumentParser(description='Predict imputation grid for a timestamp')
    parser.add_argument('--variable', choices=sorted(VARIABLES), default='pm25')
    parser.add_argument('--time', required=True, help='Target datetime, e.g. "2024-01-15 14:00"')
    args = parser.parse_args()

    target = pd.Timestamp(args.time)
    variable = args.variable
    config = VARIABLES[variable]
    final_col = f'{variable}_final'
    print(f"Predicting {variable} grid for {target} ...")

    result = predict_grid(target, variable=variable)
    print(
        f"Grid shape: {len(result)} points  "
        f"{variable} range: [{result[final_col].min():.1f}, "
        f"{result[final_col].max():.1f}] {config['unit']}"
    )
    print(f"Grid output shape: {result.shape}")

    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    fname = f"grid_{variable}_{target.strftime('%Y%m%d_%H%M')}.parquet"
    out = EXPORTS_DIR / fname
    result.to_parquet(out, index=False)
    print(f"Saved {out}")


if __name__ == '__main__':
    try:
        main()
    except (FileNotFoundError, NotImplementedError, RuntimeError, ValueError) as exc:
        print(f"[ERROR] {exc}")
        sys.exit(1)
