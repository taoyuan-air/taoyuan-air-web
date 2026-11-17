"""Exercise real model and report code against isolated synthetic station data."""
import json
import os
import subprocess
import sys
from contextlib import nullcontext

import numpy as np
import pandas as pd


def test_export_train_predict_and_reports(storage, station_data, tmp_path, monkeypatch):
    from taoyuan_ml.data import export

    monkeypatch.setattr(export, 'DATASET_DIR', storage.DATASET_DIR)
    monkeypatch.setattr(export, 'connect', lambda: nullcontext(object()))
    base_columns = ['station_id','station_name','latitude','longitude','monitor_date','pm25']
    meteo = station_data.rename(columns={'station_id':'cwa_station_id',
        'latitude':'cwa_latitude','longitude':'cwa_longitude'}).copy()
    meteo['wind_direction'] = 150.0

    def query(sql, connection, **kwargs):
        return meteo.copy() if sql == export.CWA_METEO_WIDE_QUERY else station_data[base_columns].copy()

    monkeypatch.setattr(pd, 'read_sql', query)
    exported = export.export_variable('pm25')
    assert len(exported) == len(station_data)
    assert np.isfinite(exported[['wind_u','wind_v','temperature']]).all().all()
    manifest = json.loads((storage.DATASET_DIR/'manifest.json').read_text(encoding='utf-8'))
    assert manifest['files']['pm25_hourly.parquet']['rows'] == len(station_data)

    config = tmp_path/'small.toml'
    config.write_text('''grid_resolution = 0.02
[bbox]
lat_min = 25.0
lat_max = 25.05
lon_min = 121.1
lon_max = 121.16
[xgb]
n_estimators = 8
max_depth = 2
n_jobs = 1
''', encoding='utf-8')
    env = {k:v for k,v in os.environ.items() if not k.startswith('ML_') and k != 'DATABASE_URL'}
    env['ML_ENV_FILE'] = str(tmp_path/'missing.env')
    env['PYTHONPATH'] = str(storage.ML_DIR/'src')
    env['PYTHONIOENCODING'] = 'utf-8'
    common = [sys.executable, '-m', 'taoyuan_ml', '--data-root', str(storage.DATA_ROOT)]

    def run(*arguments, ok=True):
        result = subprocess.run([*common, *arguments], cwd=tmp_path, env=env,
                                capture_output=True, text=True, encoding='utf-8', timeout=90)
        assert (result.returncode == 0) == ok, result.stdout + result.stderr
        return result

    run('--dataset-id','test-data','--run-id','test-run','--config',str(config),'train')
    assert (storage.MODELS_DIR/'xgb_pm25.json').exists()
    schema = json.loads((storage.MODELS_DIR/'feature_schema.json').read_text(encoding='utf-8'))
    assert schema['xgb_pm25.json']['target'] == 'pm25'
    # Reusing the same run must fail rather than replace existing model files.
    run('--dataset-id','test-data','--run-id','test-run','train', ok=False)
    run('--run-id','test-run','validate','--max-hours','15','--calibrate')
    assert (storage.MODELS_DIR/'calibration.json').exists()
    run('--run-id','test-run','compare','--max-hours','5')
    run('--run-id','test-run','predict','--time','2025-07-02 00:00')
    prediction = pd.read_parquet(storage.PREDICTIONS_DIR/'grid_pm25_20250702_0000.parquet')
    assert 4 <= len(prediction) <= 16  # saved small bbox, not the default full grid
    assert np.isfinite(prediction.pm25_final).all()
    assert (prediction.pm25_final >= 0).all()
    run('--run-id','test-run','shap','--sample-size','20')
    assert (storage.SHAP_DIR/'xgb_pm25_shap_importance.csv').exists()
    run('--run-id','test-run','plot','--time','2025-07-02 00:00')
    assert (storage.FIGURES_DIR/'map_pm25_20250702_0000_with_confidence.png').stat().st_size > 0
    # A changed dataset is rejected before loading or predicting with the model.
    path = storage.DATASET_DIR/'pm25_hourly.parquet'
    with path.open('ab') as stream:
        stream.write(b'changed')
    failure = run('--run-id','test-run','predict','--time','2025-07-02 00:00', ok=False)
    assert 'Dataset file changed' in failure.stderr


def test_command_help_needs_no_dataset_or_credentials(tmp_path):
    env = {k:v for k,v in os.environ.items() if not k.startswith('ML_') and k != 'DATABASE_URL'}
    from taoyuan_ml.settings import ML_DIR
    env['ML_ENV_FILE'] = str(tmp_path/'missing.env')
    env['PYTHONPATH'] = str(ML_DIR/'src')
    for command in ['export','train','predict','validate','compare','shap','plot']:
        result = subprocess.run([sys.executable,'-m','taoyuan_ml',command,'--help'],
            cwd=tmp_path, env=env, capture_output=True, text=True, timeout=30)
        assert result.returncode == 0, result.stderr


def test_all_variables_and_circular_models(storage, station_data, tmp_path):
    from taoyuan_ml.models.artifacts import record_dataset
    storage.DATASET_DIR.mkdir(parents=True)
    frame = station_data.copy()
    frame['is_raining'] = 0
    frame['wind_direction'] = (frame.monitor_date.dt.hour * 15.0) % 360
    frame['wind_dir_sin'] = np.sin(np.deg2rad(frame.wind_direction))
    frame['wind_dir_cos'] = np.cos(np.deg2rad(frame.wind_direction))
    for variable, options in storage.VARIABLES.items():
        path = storage.DATASET_DIR/options['parquet']
        frame.to_parquet(path, index=False)
        record_dataset(variable, frame, path)
    config = tmp_path/'small.toml'
    config.write_text('grid_resolution = 0.1\n[xgb]\nn_estimators = 4\nmax_depth = 2\nn_jobs = 1\n', encoding='utf-8')
    env = {k:v for k,v in os.environ.items() if not k.startswith('ML_') and k != 'DATABASE_URL'}
    env['ML_ENV_FILE'] = str(tmp_path/'missing.env')
    env['PYTHONPATH'] = str(storage.ML_DIR/'src')
    env['PYTHONIOENCODING'] = 'utf-8'
    common = [sys.executable,'-m','taoyuan_ml','--data-root',str(storage.DATA_ROOT)]
    trained = subprocess.run([*common,'--dataset-id','test-data','--run-id','test-run',
        '--config',str(config),'train','--all'], cwd=tmp_path, env=env,
        capture_output=True, text=True, encoding='utf-8', timeout=90)
    assert trained.returncode == 0, trained.stdout + trained.stderr
    models = list(storage.MODELS_DIR.glob('xgb_*.json'))
    assert len(models) == 7
    assert (storage.MODELS_DIR/'xgb_wind_dir_sin.json').exists()
    assert (storage.MODELS_DIR/'xgb_wind_dir_cos.json').exists()
    predicted = subprocess.run([*common,'--run-id','test-run','predict','--variable','humidity',
        '--time','2025-07-02 00:00'], cwd=tmp_path, env=env,
        capture_output=True, text=True, encoding='utf-8', timeout=90)
    assert predicted.returncode == 0, predicted.stdout + predicted.stderr
    humidity = pd.read_parquet(storage.PREDICTIONS_DIR/'grid_humidity_20250702_0000.parquet')
    assert humidity.humidity_final.between(0,100).all()


def test_cli_marks_failed_training_and_refuses_its_outputs(storage, station_data, tmp_path):
    from taoyuan_ml.models.artifacts import record_dataset
    storage.DATASET_DIR.mkdir(parents=True)
    path = storage.DATASET_DIR/'pm25_hourly.parquet'
    station_data.to_parquet(path, index=False)
    record_dataset('pm25', station_data, path)
    config = tmp_path/'invalid-split.toml'
    config.write_text('train_cutoff_date = "2030-01-01"\n', encoding='utf-8')
    env = {k:v for k,v in os.environ.items() if not k.startswith('ML_') and k != 'DATABASE_URL'}
    env['ML_ENV_FILE'] = str(tmp_path/'missing.env')
    env['PYTHONPATH'] = str(storage.ML_DIR/'src')
    env['PYTHONIOENCODING'] = 'utf-8'
    common = [sys.executable,'-m','taoyuan_ml','--data-root',str(storage.DATA_ROOT)]
    result = subprocess.run([*common,'--dataset-id','test-data','--run-id','test-run',
        '--config',str(config),'train'], cwd=tmp_path, env=env,
        capture_output=True, text=True, encoding='utf-8', timeout=30)
    assert result.returncode != 0
    assert 'empty data' in result.stderr
    metadata = json.loads((storage.MODELS_DIR/'metadata.json').read_text(encoding='utf-8'))
    assert metadata['status'] == 'failed'
    result = subprocess.run([*common,'--run-id','test-run','predict','--time','2025-07-02'],
        cwd=tmp_path, env=env, capture_output=True, text=True, encoding='utf-8', timeout=30)
    assert result.returncode != 0
    assert 'not completed training' in result.stderr
