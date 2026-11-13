"""Shared reader for an explicitly selected dataset."""
import pandas as pd
from taoyuan_ml import settings


def read_dataset(variable: str) -> pd.DataFrame:
    path = settings.DATASET_DIR / settings.VARIABLES[variable]['parquet']
    if not path.exists():
        raise FileNotFoundError(f'No exported data for {variable}. Run taoyuan-ml export first.')
    frame = pd.read_parquet(path)
    frame['monitor_date'] = pd.to_datetime(frame['monitor_date'])
    print(f'Loaded {len(frame):,} rows from {path.name}')
    return frame
