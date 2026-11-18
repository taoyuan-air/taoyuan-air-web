"""Read presentation data from the active run's saved experiment artifacts."""
import csv
import json
import math
import re


def _identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,99}', value):
        raise ValueError('Invalid artifact identifier')
    return value


def _json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def _number(value):
    number = float(value)
    return number if math.isfinite(number) else None


def training_report(data_root, run_id):
    """Expose selected fields only; never send paths, credentials, or raw metadata."""
    run_id = _identifier(run_id)
    active = _json(data_root/'models'/run_id/'metadata.json')
    if active.get('status') != 'complete':
        raise ValueError('Active model is incomplete')
    training = active.get('training_metadata', active)
    study = training.get('regional_study')
    result = {
        'active_run_id': run_id,
        'training_run_id': active.get('training_run_id', run_id),
        'inference_extension': active.get('run_type') == 'inference-extension',
        'study': None,
    }
    if not study:
        return result
    study_id = _identifier(study['study_id'])
    directory = data_root/'exports/ml'/study_id
    versions = []
    for name in ('baseline', 'regional'):
        version_id = _identifier(f'{study_id}-{name}')
        metadata = _json(data_root/'models'/version_id/'metadata.json')
        if metadata.get('status') != 'complete' or metadata['regional_study']['study_id'] != study_id:
            raise ValueError('Study model is incomplete or mismatched')
        source = metadata['dataset_manifest']['files']['pm25_hourly.parquet']
        versions.append({
            'model': name, 'run_id': version_id,
            'station_count': len(study['target_station_ids']) + (len(study['neighbor_stations']) if name == 'regional' else 0),
            'source_rows': source['rows'],
            'time_start': source['time_start'],
            'split_rows': metadata['split_rows'],
        })
    with (directory/'paired_metrics.csv').open(encoding='utf-8', newline='') as file:
        metrics = [{
            'task': row['task'], 'model': row['model'], 'n': int(row['n']),
            **{key: _number(row[key]) for key in ('mae', 'rmse', 'r2')},
        } for row in csv.DictReader(file)]
    for task in ('temporal', 'spatial'):
        pair = [row for row in metrics if row['task'] == task]
        if len(pair) != 2 or {row['model'] for row in pair} != {'baseline', 'regional'} or pair[0]['n'] != pair[1]['n']:
            raise ValueError('Comparison requires paired samples')
    uncertainty = []
    if (directory/'uncertainty.csv').exists():
        with (directory/'uncertainty.csv').open(encoding='utf-8', newline='') as file:
            uncertainty = [{
                'task': row['task'],
                'low': _number(row['daily_block_bootstrap_95_low']),
                'high': _number(row['daily_block_bootstrap_95_high']),
                'repeats': int(row['bootstrap_repeats']),
            } for row in csv.DictReader(file)]
    result['study'] = {
        'study_id': study_id,
        'train_end_exclusive': study['train_end_exclusive'],
        'validation_end_exclusive': study['validation_end_exclusive'],
        'test_end_exclusive': study['test_end_exclusive'],
        'neighbors': [{key: station[key] for key in ('station_name', 'county')} for station in study['neighbor_stations']],
        'versions': versions, 'metrics': metrics, 'uncertainty': uncertainty,
    }
    return result
