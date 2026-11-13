from taoyuan_ml.settings import VARIABLES
import pandas as pd

# Column names alone do not capture a change from row windows to hour windows.
FEATURE_VERSION = 'hourly-rolling-v2'

def feature_columns(variable: str = 'pm25', target_col: str | None = None) -> list[str]:
    config = VARIABLES[variable]
    lag_hours = config['lag_hours']
    cols = [f'lag_{h}h' for h in lag_hours]
    cols += ['hour', 'weekday', 'month', 'day_of_year']
    cols += [
        'sin_hour', 'cos_hour',
        'sin_month', 'cos_month',
        'sin_weekday', 'cos_weekday',
        'sin_day_of_year', 'cos_day_of_year',
    ]
    cols += ['latitude', 'longitude']
    if config.get('use_altitude'):
        cols.append('altitude')
    if config.get('use_rain_flag'):
        cols.append('is_raining')
    cols += config.get('external_features', [])

    neighbor_lags = [1, 24] if 24 in lag_hours else [1, lag_hours[-1]]
    for i in (1, 2):
        for h in neighbor_lags:
            cols.append(f'neighbor{i}_lag_{h}h')

    cols += ['rolling_mean_3h', 'rolling_mean_6h', 'rolling_std_6h']
    return cols

def required_input_columns(variable: str = 'pm25', target_col: str | None = None) -> list[str]:
    """Columns that must exist in the source parquet before feature engineering."""
    config = VARIABLES[variable]
    target_col = target_col or config['value_col']
    cols = ['station_id', 'monitor_date', 'latitude', 'longitude', target_col]
    if config.get('use_altitude'):
        cols.append('altitude')
    if config.get('use_rain_flag'):
        cols.append('is_raining')
    cols += config.get('external_features', [])
    return cols

def validate_input_columns(
    df: pd.DataFrame,
    variable: str = 'pm25',
    target_col: str | None = None,
) -> None:
    """Raise a clear error when the parquet does not match the configured schema."""
    missing = [col for col in required_input_columns(variable, target_col) if col not in df.columns]
    if not missing:
        return

    hint = (
        f"Run taoyuan-ml export --variable {variable} to regenerate the parquet "
        "with the current feature schema."
    )
    if variable == 'pm25':
        hint = (
            "PM2.5 now requires CWA meteorological external features. "
            "Run taoyuan-ml export --variable pm25 after the database is available."
        )
    raise ValueError(
        f"Missing required columns for {variable}: {missing}. {hint}"
    )

LAG_HOURS = VARIABLES['pm25']['lag_hours']
FEATURE_COLS = feature_columns('pm25')
