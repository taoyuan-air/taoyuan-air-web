"""
Two-stage grid prediction for imputation variables.

Final[grid] = XGBoost_trend[grid] + Kriging_residual[grid]

Use the taoyuan-ml entry point; see ml/README.md for commands.
"""

import argparse
import sys


import numpy as np
import pandas as pd

from taoyuan_ml.settings import PREDICTIONS_DIR, VARIABLES
from taoyuan_ml.features.definitions import feature_columns, validate_input_columns
from taoyuan_ml.spatial.uncertainty import assign_confidence_level, compute_spatial_uncertainty, load_thresholds
from taoyuan_ml.models.artifacts import load_model
from taoyuan_ml.data.datasets import read_dataset as load_station_data
from taoyuan_ml.features.temporal import _add_time_features_for_timestamp, _add_station_rolling_stats
from taoyuan_ml.features.neighbors import _add_station_neighbor_lags, _add_grid_neighbor_lags
from .grid import build_grid
from .interpolation import _idw, kriging_residual


_ROLLING_EXTRA_HOURS = list(range(1, 7))


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

    kriging_correction, kriging_variance = kriging_residual(grid, station_features)

    grid[kriging_col] = kriging_correction
    grid[variance_col] = np.asarray(kriging_variance)
    grid[final_col] = _clip_final(grid[xgb_col] + grid[kriging_col], config)

    stations_for_uncertainty = station_features[['latitude', 'longitude']]
    grid = compute_spatial_uncertainty(grid, stations_for_uncertainty)
    load_thresholds(variable)
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
        f"Grid points: {len(result)}  "
        f"{variable} range: [{result[final_col].min():.1f}, "
        f"{result[final_col].max():.1f}] {config['unit']}"
    )

    PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)
    fname = f"grid_{variable}_{target.strftime('%Y%m%d_%H%M')}.parquet"
    out = PREDICTIONS_DIR / fname
    result.to_parquet(out, index=False)
    print(f"Saved {out}")


if __name__ == '__main__':
    try:
        main()
    except (FileNotFoundError, NotImplementedError, RuntimeError, ValueError) as exc:
        print(f"[ERROR] {exc}")
        sys.exit(1)
