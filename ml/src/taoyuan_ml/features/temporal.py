import numpy as np
import pandas as pd

def add_time_features(df: pd.DataFrame, time_col: str = 'monitor_date') -> pd.DataFrame:
    """Add scalar and cyclic calendar features from a timestamp column."""
    df = df.copy()
    dt = pd.to_datetime(df[time_col])
    df['hour'] = dt.dt.hour
    df['weekday'] = dt.dt.weekday
    df['month'] = dt.dt.month
    df['day_of_year'] = dt.dt.dayofyear
    df['sin_hour'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['cos_hour'] = np.cos(2 * np.pi * df['hour'] / 24)
    df['sin_month'] = np.sin(2 * np.pi * df['month'] / 12)
    df['cos_month'] = np.cos(2 * np.pi * df['month'] / 12)
    df['sin_weekday'] = np.sin(2 * np.pi * df['weekday'] / 7)
    df['cos_weekday'] = np.cos(2 * np.pi * df['weekday'] / 7)
    df['sin_day_of_year'] = np.sin(2 * np.pi * df['day_of_year'] / 366)
    df['cos_day_of_year'] = np.cos(2 * np.pi * df['day_of_year'] / 366)
    return df

def _add_rolling_stats(df: pd.DataFrame, target_col: str) -> pd.DataFrame:
    df = df.copy()
    df['rolling_mean_3h'] = np.nan
    df['rolling_mean_6h'] = np.nan
    df['rolling_std_6h'] = np.nan

    for _, grp in df.groupby('station_id', sort=False):
        # Window by elapsed hours, not previous rows: gaps must not pull older
        # observations into a nominal 3h/6h window. Exclude the current target.
        values = grp.set_index('monitor_date')[target_col]
        df.loc[grp.index, 'rolling_mean_3h'] = values.rolling('3h', closed='left', min_periods=1).mean().values
        df.loc[grp.index, 'rolling_mean_6h'] = values.rolling('6h', closed='left', min_periods=1).mean().values
        df.loc[grp.index, 'rolling_std_6h'] = (
            values.rolling('6h', closed='left', min_periods=2).std().fillna(0.0).values
        )
    return df

def _add_time_features_for_timestamp(df: pd.DataFrame, target_time: pd.Timestamp) -> pd.DataFrame:
    df = df.copy()
    df['monitor_date'] = target_time
    return add_time_features(df).drop(columns=['monitor_date'])

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

def _calendar_feature_values(target_time: pd.Timestamp) -> dict:
    day_of_year = target_time.dayofyear
    return {
        'hour': target_time.hour,
        'weekday': target_time.weekday(),
        'month': target_time.month,
        'day_of_year': day_of_year,
        'sin_hour': np.sin(2 * np.pi * target_time.hour / 24),
        'cos_hour': np.cos(2 * np.pi * target_time.hour / 24),
        'sin_month': np.sin(2 * np.pi * target_time.month / 12),
        'cos_month': np.cos(2 * np.pi * target_time.month / 12),
        'sin_weekday': np.sin(2 * np.pi * target_time.weekday() / 7),
        'cos_weekday': np.cos(2 * np.pi * target_time.weekday() / 7),
        'sin_day_of_year': np.sin(2 * np.pi * day_of_year / 366),
        'cos_day_of_year': np.cos(2 * np.pi * day_of_year / 366),
    }
