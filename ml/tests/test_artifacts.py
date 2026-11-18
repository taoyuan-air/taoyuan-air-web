import json
import pytest
from taoyuan_ml.models.artifacts import record_dataset, prepare_run, verify_run, set_run_status, write_json


def test_run_snapshot_and_data_mutation_detection(storage, station_data):
    storage.DATASET_DIR.mkdir(parents=True)
    path = storage.DATASET_DIR/'pm25_hourly.parquet'
    station_data.to_parquet(path, index=False)
    record_dataset('pm25', station_data, path)
    prepare_run()
    set_run_status('complete')
    verify_run()
    metadata = json.loads((storage.MODELS_DIR/'metadata.json').read_text(encoding='utf-8'))
    assert metadata['dataset_id'] == 'test-data'
    assert 'DATABASE_URL' not in (storage.MODELS_DIR/'config.toml').read_text(encoding='utf-8')
    with pytest.raises(FileExistsError):
        prepare_run()
    with path.open('ab') as stream:
        stream.write(b'modified')
    with pytest.raises(ValueError, match='changed'):
        verify_run()


def test_config_mutation_is_detected(storage, station_data):
    storage.DATASET_DIR.mkdir(parents=True)
    path = storage.DATASET_DIR/'pm25_hourly.parquet'
    station_data.to_parquet(path, index=False)
    record_dataset('pm25', station_data, path)
    prepare_run()
    set_run_status('complete')
    (storage.MODELS_DIR/'config.toml').write_text('grid_resolution = 9\n', encoding='utf-8')
    with pytest.raises(ValueError, match='config changed'):
        verify_run()


def test_untracked_training_input_is_rejected(storage, station_data):
    storage.DATASET_DIR.mkdir(parents=True)
    path = storage.DATASET_DIR/'pm25_hourly.parquet'
    station_data.to_parquet(path, index=False)
    record_dataset('pm25', station_data, path)
    # Merely putting another variable's file beside the tracked file is unsafe.
    station_data.to_parquet(storage.DATASET_DIR/'humidity_hourly.parquet', index=False)
    with pytest.raises(ValueError, match='does not track humidity'):
        prepare_run(['humidity'])
    assert not storage.MODELS_DIR.exists()


def test_incomplete_and_failed_runs_cannot_be_consumed(storage, station_data):
    storage.DATASET_DIR.mkdir(parents=True)
    path = storage.DATASET_DIR/'pm25_hourly.parquet'
    station_data.to_parquet(path, index=False)
    record_dataset('pm25', station_data, path)
    prepare_run(['pm25'])
    with pytest.raises(ValueError, match='not completed'):
        verify_run()
    set_run_status('failed')
    with pytest.raises(ValueError, match='not completed'):
        verify_run()


def test_failed_json_serialization_preserves_old_file_and_cleans_temp(tmp_path):
    path = tmp_path/'manifest.json'
    write_json(path, {'valid': True})
    with pytest.raises(ValueError):
        write_json(path, {'bad': float('nan')})
    assert json.loads(path.read_text()) == {'valid': True}
    assert list(tmp_path.iterdir()) == [path]
