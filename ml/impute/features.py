"""
Feature engineering for PM2.5 imputation.

Adds per-station lag features and calendar time features.
Input DataFrame must have columns: station_id, monitor_date, pm25,
                                    latitude, longitude.
"""

import numpy as np
import pandas as pd


LAG_HOURS = [1, 2, 24]

FEATURE_COLS = (
    ['lag_1h', 'lag_2h', 'lag_24h']
    + ['hour', 'weekday', 'month', 'sin_hour', 'cos_hour']
    + ['latitude', 'longitude']
)

TARGET_COL = 'pm25'


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return df with exact hourly lag + time features appended."""
    df = df.sort_values(['station_id', 'monitor_date']).copy()
    df['monitor_date'] = pd.to_datetime(df['monitor_date'])

    # Exact timestamp lags per station. Missing hours remain NaN and are dropped,
    # so lag_1h always means the observation exactly one hour earlier.
    for h in LAG_HOURS:
        lagged = df[['station_id', 'monitor_date', 'pm25']].copy()
        lagged['monitor_date'] = lagged['monitor_date'] + pd.Timedelta(hours=h)
        lagged = lagged.rename(columns={'pm25': f'lag_{h}h'})
        df = df.merge(lagged, on=['station_id', 'monitor_date'], how='left')

    # Calendar features
    dt = df['monitor_date']
    df['hour']    = dt.dt.hour
    df['weekday'] = dt.dt.weekday
    df['month']   = dt.dt.month

    # Cyclic hour encoding so 23→0 is treated as adjacent
    df['sin_hour'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['cos_hour'] = np.cos(2 * np.pi * df['hour'] / 24)

    return df.dropna(subset=[f'lag_{h}h' for h in LAG_HOURS])
