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

# Train / validation split date
TRAIN_END_DATE = '2025-06-30'
