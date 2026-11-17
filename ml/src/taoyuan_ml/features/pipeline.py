import pandas as pd
from taoyuan_ml.settings import VARIABLES
from .definitions import validate_input_columns
from .temporal import add_time_features, _add_rolling_stats
from .neighbors import _add_neighbor_lag

def add_features(
    df: pd.DataFrame,
    variable: str = 'pm25',
    target_col: str | None = None,
) -> pd.DataFrame:
    """Add lag, rolling, calendar, spatial, and neighbor-lag features."""
    config = VARIABLES[variable]
    target_col = target_col or config['value_col']
    lag_hours = config['lag_hours']
    validate_input_columns(df, variable=variable, target_col=target_col)

    df = df.sort_values(['station_id', 'monitor_date']).copy()
    df['monitor_date'] = pd.to_datetime(df['monitor_date'])
    df[target_col] = pd.to_numeric(df[target_col], errors='coerce')
    df = df.dropna(subset=[target_col, 'latitude', 'longitude'])

    if config.get('use_altitude'):
        df['altitude'] = pd.to_numeric(df['altitude'], errors='coerce').fillna(0.0)
    if config.get('use_rain_flag'):
        df['is_raining'] = df.get('is_raining', 0).fillna(0).astype(int)
    for col in config.get('external_features', []):
        df[col] = pd.to_numeric(df[col], errors='coerce')

    df = _add_rolling_stats(df, target_col)

    for h in lag_hours:
        lagged = df[['station_id', 'monitor_date', target_col]].copy()
        lagged['monitor_date'] = lagged['monitor_date'] + pd.Timedelta(hours=h)
        lagged = lagged.rename(columns={target_col: f'lag_{h}h'})
        df = df.merge(lagged, on=['station_id', 'monitor_date'], how='left')

    df = add_time_features(df)

    df = df.dropna(subset=[f'lag_{h}h' for h in lag_hours])

    neighbor_lags = [1, 24] if 24 in lag_hours else [1, lag_hours[-1]]
    df = _add_neighbor_lag(df, lag_hours=neighbor_lags, n=2)

    return df
