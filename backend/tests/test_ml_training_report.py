"""Check active-model provenance and fair comparison without real ML artifacts."""
import json

import pytest

from backend.app.routers.ml_training_report import training_report


@pytest.fixture
def artifacts(tmp_path):
    study = {
        'study_id': 'experiment-v1', 'target_station_ids': ['a', 'b'],
        'neighbor_stations': [{'station_name': '鄰站', 'county': '新北市'}],
        'train_end_exclusive': '2025-07-01', 'validation_end_exclusive': '2025-10-01',
        'test_end_exclusive': '2026-01-01',
    }
    for name in ('baseline', 'regional'):
        directory = tmp_path/'models'/f'experiment-v1-{name}'
        directory.mkdir(parents=True)
        metadata = {'status': 'complete', 'regional_study': study,
                    'dataset_manifest': {'files': {'pm25_hourly.parquet': {
                        'rows': 200, 'time_start': '2019-01-01', 'private_path': 'hidden',
                    }}}, 'split_rows': {'train': 100, 'validation_taoyuan': 20, 'test_taoyuan': 30}}
        (directory/'metadata.json').write_text(json.dumps(metadata), encoding='utf-8')
    active = tmp_path/'models'/'deployment-v2'
    active.mkdir()
    (active/'metadata.json').write_text(json.dumps({
        'status': 'complete', 'run_type': 'inference-extension',
        'training_run_id': 'experiment-v1-regional', 'training_metadata': metadata,
    }), encoding='utf-8')
    directory = tmp_path/'exports/ml/experiment-v1'
    directory.mkdir(parents=True)
    (directory/'paired_metrics.csv').write_text(
        'task,model,n,mae,rmse,r2\n'
        'temporal,baseline,25,2.7,5.3,0.56\n'
        'temporal,regional,25,2.8,5.4,0.55\n'
        'spatial,baseline,10,3.6,7.0,0.41\n'
        'spatial,regional,10,3.5,6.9,0.42\n', encoding='utf-8')
    return tmp_path


def test_report_uses_parent_training_and_only_public_fields(artifacts):
    result = training_report(artifacts, 'deployment-v2')
    assert result['active_run_id'] == 'deployment-v2'
    assert result['training_run_id'] == 'experiment-v1-regional'
    assert result['inference_extension'] is True
    assert [version['station_count'] for version in result['study']['versions']] == [2, 3]
    assert result['study']['metrics'][0]['n'] == 25
    assert result['study']['uncertainty'] == []
    assert 'hidden' not in json.dumps(result)


def test_report_rejects_unpaired_comparison(artifacts):
    path = artifacts/'exports/ml/experiment-v1/paired_metrics.csv'
    path.write_text(path.read_text().replace('temporal,regional,25', 'temporal,regional,24'))
    with pytest.raises(ValueError, match='paired'):
        training_report(artifacts, 'deployment-v2')


def test_report_handles_no_comparison_and_rejects_unsafe_id(artifacts):
    path = artifacts/'models/deployment-v2/metadata.json'
    path.write_text(json.dumps({'status': 'complete'}))
    assert training_report(artifacts, 'deployment-v2')['study'] is None
    with pytest.raises(ValueError, match='identifier'):
        training_report(artifacts, '../secret')


def test_report_route_returns_data_and_handles_missing_artifacts(artifacts, monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql+asyncpg://test:test@localhost/test')
    monkeypatch.setenv('SECRET_KEY', 'local-test-only-secret')
    from backend.app.routers import ml_history
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    monkeypatch.setattr(ml_history, 'DATA_ROOT', artifacts)
    monkeypatch.setattr(ml_history, 'RUN_ID', 'deployment-v2')
    app = FastAPI()
    app.include_router(ml_history.router)
    client = TestClient(app)
    response = client.get('/ml/history/training-report')
    assert response.status_code == 200
    assert response.json()['study']['metrics'][0]['mae'] == 2.7
    monkeypatch.setattr(ml_history, 'DATA_ROOT', artifacts/'missing')
    response = client.get('/ml/history/training-report')
    assert response.status_code == 503
    assert str(artifacts) not in response.text
