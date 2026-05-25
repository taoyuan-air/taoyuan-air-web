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
    """Return df with lag + time features appended. Rows with NaN lags are dropped."""
    df = df.sort_values(['station_id', 'monitor_date']).copy()

    # Lag features per station
    for h in LAG_HOURS:
        df[f'lag_{h}h'] = df.groupby('station_id')['pm25'].shift(h)

    # Calendar features
    dt = df['monitor_date']
    df['hour']    = dt.dt.hour
    df['weekday'] = dt.dt.weekday
    df['month']   = dt.dt.month

    # Cyclic hour encoding so 23→0 is treated as adjacent
    df['sin_hour'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['cos_hour'] = np.cos(2 * np.pi * df['hour'] / 24)

    return df.dropna(subset=[f'lag_{h}h' for h in LAG_HOURS])
