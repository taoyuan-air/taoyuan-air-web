"""Deterministic paths and configuration; credentials never enter TOML snapshots."""
import copy
import os
import re
import math
import tomllib
from pathlib import Path
from dotenv import load_dotenv

ML_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = ML_DIR.parent
DEFAULT_CONFIG = ML_DIR / 'configs/default.toml'


def validate_id(value: str) -> str:
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,99}', value):
        raise ValueError('IDs must contain 1-100 letters, digits, underscores or hyphens.')
    return value


def merge_config(base: dict, overlay: dict, prefix: str = '') -> dict:
    result = copy.deepcopy(base)
    for key, value in overlay.items():
        optional_variable_key = prefix.startswith('variables.') and key in ('clip_min', 'clip_max', 'external_features')
        if key not in result and not optional_variable_key:
            raise ValueError(f'Unknown experiment setting: {prefix + "." if prefix else ""}{key}')
        section = f'{prefix}.{key}' if prefix else key
        result[key] = merge_config(result[key], value, section) if isinstance(value, dict) and isinstance(result.get(key), dict) else copy.deepcopy(value)
    return result


def read_config(path: Path | None = None, *, snapshot: bool = False) -> dict:
    with DEFAULT_CONFIG.open('rb') as stream:
        config = tomllib.load(stream)
    if path is not None and path.resolve() != DEFAULT_CONFIG.resolve():
        with path.open('rb') as stream:
            override = tomllib.load(stream)
            config = override if snapshot else merge_config(config, override)
    if not isinstance(config['grid_resolution'], (int, float)) or not math.isfinite(config['grid_resolution']) or config['grid_resolution'] <= 0:
        raise ValueError('grid_resolution must be positive.')
    bbox = config['bbox']
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in bbox.values()):
        raise ValueError('Bounding box coordinates must be finite numbers.')
    if bbox['lat_min'] >= bbox['lat_max'] or bbox['lon_min'] >= bbox['lon_max']:
        raise ValueError('Bounding box minimum must be below maximum.')
    for variable, options in config['variables'].items():
        filename = options['parquet']
        if Path(filename).name != filename or '/' in filename or '\\' in filename:
            raise ValueError(f'{variable}: parquet must be a file name, without directories.')
        lags = options['lag_hours']
        if not isinstance(lags, list) or len(lags) < 2 or any(type(h) is not int or h <= 0 for h in lags) or 1 not in lags or lags != sorted(set(lags)):
            raise ValueError(f'{variable}: lag_hours must be sorted, unique positive integers including 1 and at least one other lag.')
    return config


ENV_FILE = Path(os.environ.get('ML_ENV_FILE', ML_DIR / '.env')).resolve()
load_dotenv(ENV_FILE, override=False)
CONFIG = read_config(Path(os.environ['ML_CONFIG_FILE']) if os.environ.get('ML_CONFIG_FILE') else None,
                     snapshot=os.environ.get('ML_CONFIG_SNAPSHOT') == '1')
DATABASE_URL = os.environ.get('DATABASE_URL', '')
DATA_ROOT = Path(os.environ.get('ML_DATA_ROOT', ROOT_DIR / 'data')).resolve()
DATASET_ID = validate_id(os.environ.get('ML_DATASET_ID', 'default'))
RUN_ID = validate_id(os.environ.get('ML_RUN_ID', 'default'))
DATASET_DIR = DATA_ROOT / 'processed/ml' / DATASET_ID
MODELS_DIR = DATA_ROOT / 'models' / RUN_ID
EXPORTS_DIR = DATA_ROOT / 'exports/ml' / RUN_ID
PREDICTIONS_DIR = EXPORTS_DIR / 'predictions'
METRICS_DIR = EXPORTS_DIR / 'metrics'
SHAP_DIR = EXPORTS_DIR / 'shap'
FIGURES_DIR = EXPORTS_DIR / 'figures'
TRAIN_CUTOFF_DATE = CONFIG['train_cutoff_date']
GRID_RESOLUTION = CONFIG['grid_resolution']
TAOYUAN_BBOX = CONFIG['bbox']
XGB_PARAMS = CONFIG['xgb']
VARIABLES = CONFIG['variables']
