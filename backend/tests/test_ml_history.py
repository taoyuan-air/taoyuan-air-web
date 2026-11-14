"""Historical API boundary and worker failure tests; no database or real credentials."""
import importlib
import json
import subprocess
import sys
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def history_api(tmp_path, monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql+asyncpg://test:test@localhost/test')
    monkeypatch.setenv('SECRET_KEY', 'local-test-only-secret')
    module = importlib.import_module('backend.app.routers.ml_history')
    monkeypatch.setattr(module, 'DIRECTORY', tmp_path)
    monkeypatch.setattr(module, 'PYTHON', module.Path(sys.executable))
    (tmp_path/'catalog.json').write_text(json.dumps({'dates': {'2026-03-31': ['14:00']}}))
    app = FastAPI()
    app.include_router(module.router, prefix='/api')
    return module, TestClient(app), tmp_path


def test_cached_geojson_and_unavailable_times(history_api):
    module, client, directory = history_api
    (directory/'20260331_1400.geojson').write_text('{"type":"FeatureCollection","features":[]}')
    response = client.get('/api/ml/history/grid', params={'time': '2026-03-31T14:00'})
    assert response.status_code == 200
    assert response.json()['type'] == 'FeatureCollection'
    assert client.get('/api/ml/history/grid', params={'time': '2026-03-31T15:00'}).status_code == 404
    for invalid in ['../../.env', '2026-02-31T14:00', '2026-03-31T14:30']:
        assert client.get('/api/ml/history/grid', params={'time': invalid}).status_code == 422


def test_generation_uses_argument_list_and_busy_lock(history_api, monkeypatch):
    module, client, directory = history_api
    def generate(command, **kwargs):
        assert isinstance(command, list) and command[-1] == '2026-03-31T14:00'
        assert kwargs['timeout'] == 120
        (directory/'20260331_1400.geojson').write_text('{"type":"FeatureCollection","features":[]}')
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(module.subprocess, 'run', generate)
    module._lock.acquire()
    try:
        assert client.get('/api/ml/history/grid', params={'time': '2026-03-31T14:00'}).status_code == 503
    finally:
        module._lock.release()
    assert client.get('/api/ml/history/grid', params={'time': '2026-03-31T14:00'}).status_code == 200


def test_generation_timeout_releases_lock(history_api, monkeypatch):
    module, client, _ = history_api
    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired('test-worker', 120)
    monkeypatch.setattr(module.subprocess, 'run', timeout)
    assert client.get('/api/ml/history/grid', params={'time': '2026-03-31T14:00'}).status_code == 504
    assert not module._lock.locked()
