import os
import subprocess
import sys
import tomllib

import pytest
from taoyuan_ml.settings import ML_DIR, read_config, validate_id
from taoyuan_ml.models.artifacts import toml_snapshot


def test_overlay_and_snapshot_roundtrip(tmp_path):
    path = tmp_path/'experiment.toml'
    path.write_text('[xgb]\nmax_depth = 3\n', encoding='utf-8')
    config = read_config(path)
    assert config['xgb']['max_depth'] == 3
    assert config['xgb']['n_estimators'] == 500
    assert tomllib.loads(toml_snapshot(config)) == config
    path.write_text('[xgb]\nmax_dept = 3\n', encoding='utf-8')
    with pytest.raises(ValueError, match='Unknown'):
        read_config(path)


@pytest.mark.parametrize('value', ['../escape', '/root', 'a/b', 'a\\b', '', '.'])
def test_ids_cannot_escape_storage(value):
    with pytest.raises(ValueError):
        validate_id(value)


def test_env_file_is_explicit_and_cwd_independent(tmp_path):
    env_file = tmp_path/'settings.env'
    env_file.write_text('DATABASE_URL=postgresql://test:test@localhost/test\n', encoding='utf-8')
    env = {k:v for k,v in os.environ.items() if not k.startswith('ML_') and k != 'DATABASE_URL'}
    env['ML_ENV_FILE'] = str(env_file)
    env['PYTHONPATH'] = str(ML_DIR/'src')
    script = 'from taoyuan_ml.settings import DATABASE_URL; assert DATABASE_URL.endswith("/test")'
    result = subprocess.run([sys.executable, '-c', script], cwd=tmp_path, env=env, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
