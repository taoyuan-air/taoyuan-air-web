"""Manifests, model schemas, and isolated experiment runs."""
import hashlib
import importlib.metadata
import json
import os
import platform
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from taoyuan_ml import settings


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         suffix='.tmp', delete=False) as stream:
            temp = Path(stream.name)
            json.dump(data, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write('\n')
        os.replace(temp, path)
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def model_name(variable: str, target_col: str) -> str:
    if variable == 'wind_direction':
        suffix = 'sin' if target_col.endswith('_sin') else 'cos'
        return f'xgb_wind_dir_{suffix}.json'
    return f'xgb_{variable}.json'


def save_model(model, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Keep native XGBoost file I/O in the OS temp directory, as in the legacy
    # trainer; copy through Python for Windows paths containing Chinese text.
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as stream:
        temp = Path(stream.name)
    destination = None
    try:
        model.save_model(str(temp))
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
            destination = Path(stream.name)
            stream.write(temp.read_bytes())
        os.replace(destination, path)
    finally:
        temp.unlink(missing_ok=True)
        if destination is not None:
            destination.unlink(missing_ok=True)


def load_model(variable: str, target_col: str):
    from xgboost import XGBRegressor
    from taoyuan_ml.features.definitions import feature_columns, FEATURE_VERSION

    path = settings.MODELS_DIR / model_name(variable, target_col)
    if not path.exists():
        raise FileNotFoundError(f'Model not found: {path}. Train this variable first.')
    model = XGBRegressor(**settings.XGB_PARAMS)
    model.load_model(bytearray(path.read_bytes()))
    expected = feature_columns(variable, target_col)
    actual = model.get_booster().feature_names
    if actual is not None and list(actual) != expected:
        raise ValueError(f'Model feature schema mismatch for {variable}; train a new run.')
    schema_path = settings.MODELS_DIR / 'feature_schema.json'
    schema = json.loads(schema_path.read_text(encoding='utf-8'))
    entry = schema.get(model_name(variable, target_col), {})
    if entry.get('feature_version') != FEATURE_VERSION:
        raise ValueError('Model uses an older feature calculation. Train a new run.')
    if entry.get('features') != expected:
        raise ValueError(f'Saved feature schema mismatch for {variable}.')
    return model


def record_schema(variable: str, target_col: str, columns: list[str]) -> None:
    from taoyuan_ml.features.definitions import FEATURE_VERSION
    path = settings.MODELS_DIR / 'feature_schema.json'
    schema = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    schema[model_name(variable, target_col)] = {
        'variable': variable, 'target': target_col, 'features': columns,
        'feature_version': FEATURE_VERSION,
    }
    write_json(path, schema)


def record_dataset(variable: str, frame, path: Path) -> None:
    manifest_path = settings.DATASET_DIR / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {
        'dataset_id': settings.DATASET_ID, 'sources': ['PostgreSQL: MOE, TYDEP, CWA'], 'files': {},
    }
    manifest['files'][path.name] = {
        'variable': variable, 'rows': len(frame), 'columns': list(frame.columns),
        'dtypes': {column: str(dtype) for column, dtype in frame.dtypes.items()},
        'time_start': str(frame['monitor_date'].min()), 'time_end': str(frame['monitor_date'].max()),
        'sha256': sha256(path), 'exported_at': datetime.now(timezone.utc).isoformat(),
    }
    write_json(manifest_path, manifest)


def verify_dataset(manifest: dict) -> None:
    if manifest.get('dataset_id') != settings.DATASET_ID or not manifest.get('files'):
        raise ValueError('Dataset manifest is empty or has a different dataset_id.')
    for name, info in manifest['files'].items():
        if Path(name).name != name or '/' in name or '\\' in name:
            raise ValueError('Invalid file name in dataset manifest.')
        path = settings.DATASET_DIR / name
        if not path.is_file() or sha256(path) != info['sha256']:
            raise ValueError(f'Dataset file changed or is missing: {name}. Export a new dataset.')


def toml_snapshot(config: dict, prefix: str = '') -> str:
    scalars, tables = [], []
    for key, value in config.items():
        if isinstance(value, dict):
            tables.append((key, value))
        elif value is not None:
            scalars.append(f'{key} = {json.dumps(value, ensure_ascii=False)}')
    text = '\n'.join(scalars) + '\n'
    for key, value in tables:
        section = f'{prefix}.{key}' if prefix else key
        text += f'\n[{section}]\n' + toml_snapshot(value, section)
    return text


def prepare_run(variables: list[str] | None = None) -> None:
    manifest_path = settings.DATASET_DIR / 'manifest.json'
    if not manifest_path.exists():
        raise FileNotFoundError('Dataset manifest missing. Run taoyuan-ml export first.')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    verify_dataset(manifest)
    for variable in variables or []:
        name = settings.VARIABLES[variable]['parquet']
        if name not in manifest['files'] or manifest['files'][name]['variable'] != variable:
            raise ValueError(f'Dataset manifest does not track {variable}: {name}. Export a new dataset.')
    versions = {}
    for package in ['taoyuan-ml', 'numpy', 'pandas', 'xgboost', 'scikit-learn', 'pykrige', 'shap', 'pyarrow']:
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            versions[package] = 'not installed'
    commit, dirty_worktree = None, None
    try:
        result = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=settings.ROOT_DIR,
                                capture_output=True, text=True, check=False)
        dirty = subprocess.run(['git', 'status', '--porcelain', '--', 'ml'], cwd=settings.ROOT_DIR,
                               capture_output=True, text=True, check=False)
        commit = result.stdout.strip() if result.returncode == 0 else None
        dirty_worktree = bool(dirty.stdout.strip()) if dirty.returncode == 0 else None
    except OSError:
        pass  # Git provenance is optional on machines without git installed.
    metadata = {
        'run_id': settings.RUN_ID, 'dataset_id': settings.DATASET_ID,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'git_commit': commit,
        'ml_worktree_dirty': dirty_worktree, 'versions': versions,
        'status': 'training',
        'python_version': platform.python_version(),
        'dataset_manifest': manifest,
    }
    settings.MODELS_DIR.mkdir(parents=True, exist_ok=False)
    config_path = settings.MODELS_DIR / 'config.toml'
    config_path.write_text(toml_snapshot(settings.CONFIG), encoding='utf-8')
    metadata['config_sha256'] = sha256(config_path)
    write_json(settings.MODELS_DIR / 'metadata.json', metadata)


def verify_run() -> None:
    metadata = json.loads((settings.MODELS_DIR / 'metadata.json').read_text(encoding='utf-8'))
    if metadata['run_id'] != settings.RUN_ID or metadata['dataset_id'] != settings.DATASET_ID:
        raise ValueError('Run and dataset identity mismatch.')
    if metadata.get('status') != 'complete':
        raise ValueError('Run has not completed training. Train a new run before using its outputs.')
    if sha256(settings.MODELS_DIR / 'config.toml') != metadata['config_sha256']:
        raise ValueError('Saved experiment config changed. Train a new run instead.')
    verify_dataset(metadata['dataset_manifest'])


def set_run_status(status: str) -> None:
    if status not in ('complete', 'failed'):
        raise ValueError('Invalid run status.')
    path = settings.MODELS_DIR / 'metadata.json'
    metadata = json.loads(path.read_text(encoding='utf-8'))
    metadata['status'] = status
    write_json(path, metadata)
