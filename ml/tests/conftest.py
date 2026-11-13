import os
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Tests never discover the user's actual env file.
os.environ['ML_ENV_FILE'] = str(Path(__file__).parent / 'nonexistent-test.env')


@pytest.fixture
def station_data():
    rows = []
    rng = np.random.default_rng(123)
    locations = [(25.0,121.1), (25.04,121.1), (25.01,121.14), (25.045,121.15)]
    for i, (lat, lon) in enumerate(locations):
        for t, time in enumerate(pd.date_range('2025-06-29', periods=120, freq='h')):
            rows.append({
                'station_id': f'S{i}', 'station_name': f'Station {i}',
                'latitude': lat, 'longitude': lon, 'monitor_date': time,
                'pm25': 20 + i * 2 + np.sin(t / 8) * 5 + rng.normal(),
                'temperature': 23 + i + np.sin(t / 24), 'humidity': 65 + i,
                'wind_speed': 2 + i * 0.5, 'wind_u': 1 + i * 0.2,
                'wind_v': -1 - i * 0.2, 'pressure': 1000 + i, 'altitude': 10 + i,
            })
    return pd.DataFrame(rows)


@pytest.fixture
def storage(tmp_path, monkeypatch):
    from taoyuan_ml import settings
    tmp_path = tmp_path / 'ML 資料 with spaces'
    paths = {
        'DATA_ROOT': tmp_path, 'DATASET_DIR': tmp_path/'processed/ml/test-data',
        'MODELS_DIR': tmp_path/'models/test-run', 'EXPORTS_DIR': tmp_path/'exports/ml/test-run',
        'PREDICTIONS_DIR': tmp_path/'exports/ml/test-run/predictions',
        'METRICS_DIR': tmp_path/'exports/ml/test-run/metrics',
        'SHAP_DIR': tmp_path/'exports/ml/test-run/shap',
        'FIGURES_DIR': tmp_path/'exports/ml/test-run/figures',
    }
    for key, value in paths.items():
        monkeypatch.setattr(settings, key, value)
    monkeypatch.setattr(settings, 'DATASET_ID', 'test-data')
    monkeypatch.setattr(settings, 'RUN_ID', 'test-run')
    return settings
