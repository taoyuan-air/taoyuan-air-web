import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

ROOT_DIR = Path(__file__).parent.parent

DB_CONFIG = {
    'host':     os.getenv('POSTGRES_HOST', 'localhost'),
    'port':     os.getenv('POSTGRES_PORT', '5432'),
    'database': os.getenv('POSTGRES_DB', 'taoyuan_air'),
    'user':     os.getenv('POSTGRES_USER', 'taoyuan_user'),
    'password': os.getenv('POSTGRES_PASSWORD'),
}

POLLUTANT = 'PM2.5'

EXPORTS_DIR = ROOT_DIR / 'data' / 'exports'
MODELS_DIR  = ROOT_DIR / 'data' / 'models'

VARIABLES = {
    'pm25': {
        'parquet': 'pm25_hourly.parquet',
        'value_col': 'pm25',
        'lag_hours': [1, 2, 3, 6, 12, 24],
        'use_altitude': False,
        'use_rain_flag': False,
        'circular': False,
        'clip_min': 0.0,
        'clip_max': None,
        'unit': 'ug/m3',
    },
    'temperature': {
        'parquet': 'temperature_hourly.parquet',
        'value_col': 'temperature',
        'lag_hours': [1, 3, 6, 12, 24],
        'use_altitude': True,
        'use_rain_flag': False,
        'circular': False,
        'clip_min': None,
        'clip_max': None,
        'unit': 'C',
    },
    'humidity': {
        'parquet': 'humidity_hourly.parquet',
        'value_col': 'humidity',
        'lag_hours': [1, 3, 6, 12, 24],
        'use_altitude': True,
        'use_rain_flag': True,
        'circular': False,
        'clip_min': 0.0,
        'clip_max': 100.0,
        'unit': '%',
    },
    'wind_speed': {
        'parquet': 'wind_speed_hourly.parquet',
        'value_col': 'wind_speed',
        'lag_hours': [1, 3, 6, 12, 24],
        'use_altitude': True,
        'use_rain_flag': False,
        'circular': False,
        'clip_min': 0.0,
        'clip_max': None,
        'unit': 'm/s',
    },
    'wind_direction': {
        'parquet': 'wind_direction_hourly.parquet',
        'value_col': 'wind_direction',
        'lag_hours': [1, 3, 6, 12],
        'use_altitude': True,
        'use_rain_flag': False,
        'circular': True,
        'clip_min': None,
        'clip_max': None,
        'unit': 'degree',
    },
}

# Taoyuan bounding box
TAOYUAN_BBOX = {
    'lat_min': 24.77,
    'lat_max': 25.15,
    'lon_min': 121.05,
    'lon_max': 121.50,
}
GRID_RESOLUTION = 0.01  # degrees (~1 km)

# XGBoost hyperparameters (tunable)
XGB_PARAMS = {
    'n_estimators':     500,
    'max_depth':        6,
    'learning_rate':    0.05,
    'subsample':        0.8,
    'colsample_bytree': 0.8,
    'random_state':     42,
    'n_jobs':           -1,
}

# Train / validation split cutoff. Rows before this timestamp are used for
# training; rows at or after this timestamp are used for validation.
TRAIN_CUTOFF_DATE = '2025-07-01'
