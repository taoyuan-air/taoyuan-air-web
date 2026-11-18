"""Reproducible paired Taoyuan-only versus regional PM2.5 study.

Uses official annual archives, preserves the original dataset, and never changes
the website's active run. October-December 2025 is a separate held-out test.
"""
import argparse
import copy
import csv
import io
import json
import math
import os
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'ml/src'))


def concentration(value):
    try:
        number = float(str(value).strip())
    except (ValueError, TypeError):
        return None
    return number if math.isfinite(number) and 0 <= number <= 1000 else None


def metrics_for_json(metrics):
    """Undefined R²/recall are null, rather than invalid JSON or failed training."""
    return {key: None if key in ('r2', 'high_recall') and not math.isfinite(value) else value
            for key, value in metrics.items()}


def read_station_csv(text, station):
    """Parse valid hourly PM2.5 only, retaining rejection counts separately."""
    import pandas as pd
    rows, rejected = [], 0
    for record in csv.DictReader(io.StringIO(text)):
        if (record.get('測項') or record.get('ItemName') or '').strip().upper() != 'PM2.5':
            continue
        name = (record.get('測站') or record.get('SiteName') or '').strip()
        if name != station['station_name']:
            raise ValueError(f'Archive station name mismatch: {name}')
        day = pd.Timestamp(record.get('日期') or record.get('MonitorDate')).normalize()
        for hour in range(24):
            raw = record.get(f'{hour:02d}', record.get(str(hour)))
            value = concentration(raw)
            if value is None:
                rejected += 1
                continue
            rows.append({**station, 'source': 'moe', 'altitude': None,
                         'monitor_date': day + pd.Timedelta(hours=hour), 'pm25': value})
    return rows, rejected


def temporal_partitions(featured, target_ids, cutoff, test_start, end):
    """Keep the test period out of fitting and early stopping; score Taoyuan only."""
    if not cutoff < test_start < end:
        raise ValueError('Split boundaries must be strictly increasing.')
    train = featured[featured.monitor_date < cutoff]
    target = featured[featured.station_id.isin(target_ids)]
    validation = target[(target.monitor_date >= cutoff) & (target.monitor_date < test_start)]
    test = target[(target.monitor_date >= test_start) & (target.monitor_date < end)]
    return train, validation, test


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-dataset-id', required=True)
    parser.add_argument('--study-id', required=True)
    parser.add_argument('--env-file', type=Path, default=ROOT/'backend/.env')
    parser.add_argument('--archives', type=Path, default=ROOT/'data/raw/moe-regional')
    parser.add_argument('--stations', type=Path, default=ROOT/'ml/configs/regional_stations.json')
    parser.add_argument('--spatial-hours', type=int, default=30, help='Paired test hours per Taoyuan station')
    args = parser.parse_args()
    os.environ.update(ML_ENV_FILE=str(args.env_file.resolve()), OMP_NUM_THREADS='4', OPENBLAS_NUM_THREADS='4')
    import numpy as np
    import pandas as pd
    from pyproj import Transformer
    from xgboost import XGBRegressor
    from taoyuan_ml import settings
    from taoyuan_ml.data.database import connect
    from taoyuan_ml.data.export import _add_pm25_meteo_features
    from taoyuan_ml.features.pipeline import add_features
    from taoyuan_ml.features.definitions import feature_columns
    from taoyuan_ml.models.artifacts import (sha256, write_json, record_dataset,
        prepare_run, save_model, record_schema, set_run_status)
    from taoyuan_ml.evaluation.metrics import _metrics, nonnegative_predictions
    from taoyuan_ml.evaluation.point_features import _build_station_features

    study_id = settings.validate_id(args.study_id)
    settings.validate_id(args.base_dataset_id)
    if args.spatial_hours < 1:
        parser.error('--spatial-hours must be positive')
    out = settings.DATA_ROOT/'exports/ml'/study_id
    if out.exists():
        raise FileExistsError('Study already exists. Choose a new --study-id.')
    base_dir = settings.DATA_ROOT/'processed/ml'/args.base_dataset_id
    manifest = json.loads((base_dir/'manifest.json').read_text(encoding='utf-8'))
    base_path = base_dir/'pm25_hourly.parquet'
    if sha256(base_path) != manifest['files'][base_path.name]['sha256']:
        raise ValueError('Original dataset checksum mismatch.')
    baseline = pd.read_parquet(base_path)
    baseline['monitor_date'] = pd.to_datetime(baseline.monitor_date)
    baseline = baseline[baseline.monitor_date < '2026-01-01'].copy()
    target_ids = sorted(baseline.station_id.unique())
    metadata = json.loads(args.stations.read_text(encoding='utf-8'))
    stations = metadata['stations']
    if set(target_ids).intersection(s['station_id'] for s in stations):
        raise ValueError('Additional stations overlap baseline stations.')
    archives = sorted(args.archives.glob('20*.zip'))
    if not archives:
        raise FileNotFoundError('No annual archives found. Download official archives first.')
    rows, sources, rejections = [], [], {}
    to_wgs = Transformer.from_crs(metadata['coordinate_crs'], 'EPSG:4326', always_xy=True)
    for archive in archives:
        used = []
        with zipfile.ZipFile(archive) as zipped:
            for station in stations:
                members = [name for name in zipped.namelist() if Path(name).name.startswith(station['station_name']+'_') and name.lower().endswith('.csv')]
                for name in members:
                    lon, lat = to_wgs.transform(station['longitude'], station['latitude'])
                    item = {**station, 'longitude': lon, 'latitude': lat}
                    data, rejected = read_station_csv(zipped.read(name).decode('utf-8-sig'), item)
                    rows.extend(data)
                    rejections[name] = rejected
                    used.append(name)
        if used:
            resolved = archive.resolve()
            sources.append({'path': str(resolved.relative_to(ROOT) if resolved.is_relative_to(ROOT) else resolved),
                            'sha256': sha256(archive), 'members': used})
    neighbors = pd.DataFrame(rows)
    if neighbors.empty:
        raise ValueError('No selected station data found in archives.')
    if neighbors.duplicated(['station_id', 'monitor_date']).any():
        raise ValueError('Duplicate station/hour in regional archives.')
    if set(neighbors.station_id) != {s['station_id'] for s in stations}:
        raise ValueError('Some requested neighboring stations are missing.')
    neighbors = neighbors[(neighbors.monitor_date >= baseline.monitor_date.min()) & (neighbors.monitor_date < '2026-01-01')]
    with connect() as conn:
        neighbors = _add_pm25_meteo_features(conn, neighbors)
    augmented = pd.concat([baseline, neighbors], ignore_index=True).sort_values(['monitor_date', 'station_id'])
    cutoff, test_start, end = map(pd.Timestamp, ['2025-07-01', '2025-10-01', '2026-01-01'])
    study = {'study_id': study_id, 'base_dataset_id': args.base_dataset_id,
        'target_station_ids': target_ids, 'neighbor_stations': stations,
        'train_end_exclusive': str(cutoff), 'validation_end_exclusive': str(test_start),
        'test_end_exclusive': str(end), 'sources': sources, 'invalid_hourly_values': rejections,
        'station_metadata_source': metadata['source'], 'station_metadata_sha256': sha256(args.stations),
        'weather_policy': 'Unchanged nearest-CWA mapping; Taoyuan baseline meteorological values preserved.',
        'notes': ['Annual neighbor archives end in 2025; no 2026 values fabricated.',
                  'Current station coordinates; historical relocations not reconstructed.']}
    out.mkdir(parents=True)
    write_json(out/'study.json', study)
    neighbors.groupby(['station_id', 'station_name', 'county']).agg(rows=('pm25','size'), start=('monitor_date','min'), end=('monitor_date','max')).to_csv(out/'neighbor_coverage.csv')
    cols = feature_columns('pm25')
    models, frames, test_frames = {}, {}, {}
    summaries = []
    original_config = copy.deepcopy(settings.CONFIG)
    for name, frame in [('baseline', baseline), ('regional', augmented)]:
        dataset_id, run_id = f'{study_id}-{name}', f'{study_id}-{name}'
        settings.DATASET_ID = settings.validate_id(dataset_id)
        settings.DATASET_DIR = settings.DATA_ROOT/'processed/ml'/dataset_id
        settings.RUN_ID = settings.validate_id(run_id)
        settings.MODELS_DIR = settings.DATA_ROOT/'models'/run_id
        settings.EXPORTS_DIR = settings.DATA_ROOT/'exports/ml'/run_id
        settings.METRICS_DIR = settings.EXPORTS_DIR/'metrics'
        settings.CONFIG = copy.deepcopy(original_config)
        settings.CONFIG['xgb']['n_jobs'] = 4
        settings.DATASET_DIR.mkdir(parents=True, exist_ok=False)
        path = settings.DATASET_DIR/'pm25_hourly.parquet'
        frame.to_parquet(path, index=False)
        record_dataset('pm25', frame, path)
        dataset_manifest = json.loads((settings.DATASET_DIR/'manifest.json').read_text(encoding='utf-8'))
        dataset_manifest['sources'] = ['Preserved baseline dataset: '+args.base_dataset_id] + ([metadata['source'], 'Official MOE annual northern and Hsinchu/Miaoli archives'] if name=='regional' else [])
        dataset_manifest['regional_study'] = study
        write_json(settings.DATASET_DIR/'manifest.json', dataset_manifest)
        print(f'\n{name}: {len(frame):,} rows, {frame.station_id.nunique()} stations', flush=True)
        featured = add_features(frame).dropna(subset=cols+['pm25'])
        train, validation, test = temporal_partitions(featured,target_ids,cutoff,test_start,end)
        if any(part.empty for part in [train, validation, test]):
            raise ValueError('A training/validation/test partition is empty.')
        prepare_run(['pm25'])
        run_metadata = json.loads((settings.MODELS_DIR/'metadata.json').read_text(encoding='utf-8'))
        run_metadata['regional_study'] = study
        run_metadata['split_rows'] = {'train': len(train), 'validation_taoyuan': len(validation), 'test_taoyuan': len(test)}
        write_json(settings.MODELS_DIR/'metadata.json', run_metadata)
        try:
            model = XGBRegressor(**settings.CONFIG['xgb'], early_stopping_rounds=50)
            model.fit(train[cols], train.pm25, eval_set=[(validation[cols],validation.pm25)], verbose=100)
            save_model(model, settings.MODELS_DIR/'xgb_pm25.json')
            record_schema('pm25','pm25',cols)
            settings.METRICS_DIR.mkdir(parents=True)
            for split_name, part in [('validation', validation), ('test', test)]:
                prediction = nonnegative_predictions(model.predict(part[cols]))
                metrics = {'model': name, 'split': split_name, 'n': len(part), **_metrics(part.pm25.to_numpy(), prediction, 35.)}
                summaries.append(metrics)
            write_json(settings.METRICS_DIR/'metrics.json', [metrics_for_json(row) for row in summaries[-2:]])
            set_run_status('complete')
        except BaseException:
            set_run_status('failed')
            raise
        models[name], frames[name], test_frames[name] = model, frame, test
        print(f'{name} best_iteration={model.best_iteration}, test_n={len(test):,}', flush=True)

    # Fair time validation: identical Taoyuan station/hour targets, separate features.
    paired = test_frames['baseline'][['station_id','monitor_date','pm25']].merge(
        test_frames['regional'][['station_id','monitor_date']],on=['station_id','monitor_date'],validate='one_to_one')
    for name, test in test_frames.items():
        selected = paired[['station_id','monitor_date']].merge(test,on=['station_id','monitor_date'],validate='one_to_one')
        paired[name] = nonnegative_predictions(models[name].predict(selected[cols]))
    paired.to_parquet(out/'paired_temporal_predictions.parquet', index=False)
    temporal = [{'model':name, 'n':len(paired), **_metrics(paired.pm25.to_numpy(),paired[name].to_numpy(),35.)} for name in models]
    pd.DataFrame(temporal).to_csv(out/'paired_temporal_metrics.csv',index=False)
    pd.DataFrame(summaries).to_csv(out/'all_metrics.csv',index=False)
    per_station = []
    for sid, group in paired.groupby('station_id'):
        for name in models:
            per_station.append({'station_id': sid, 'model': name, 'n':len(group), **_metrics(group.pm25.to_numpy(),group[name].to_numpy(),35.)})
    pd.DataFrame(per_station).to_csv(out/'paired_station_metrics.csv',index=False)

    # Retrospective map diagnostic: omit the target station from feature inputs.
    # Models are fixed; this is NOT station-wise retraining/generalization testing.
    spatial = []
    for sid in target_ids:
        held = baseline[(baseline.station_id == sid) & (baseline.monitor_date >= test_start) & (baseline.monitor_date < end)]
        if len(held)>args.spatial_hours:
            held=held.sample(args.spatial_hours,random_state=42)
        remaining = {name:frame[frame.station_id != sid] for name,frame in frames.items()}
        for row in held.itertuples():
            record = {'station_id':sid, 'monitor_date':row.monitor_date, 'pm25':row.pm25}
            for name, frame in remaining.items():
                _, point = _build_station_features(row.latitude,row.longitude,row.monitor_date,frame)
                if point is None:
                    break
                record[name] = float(nonnegative_predictions(models[name].predict(point))[0])
            if all(name in record for name in models):
                spatial.append(record)
        print(f'Spatial paired cases completed: {sid}', flush=True)
    spatial = pd.DataFrame(spatial)
    if spatial.empty:
        raise ValueError('No paired spatial test cases.')
    spatial.to_csv(out/'paired_spatial_predictions.csv', index=False)
    spatial_metrics = [{'model':name, 'n':len(spatial), **_metrics(spatial.pm25.to_numpy(),spatial[name].to_numpy(),35.)} for name in models]
    pd.DataFrame(spatial_metrics).to_csv(out/'paired_spatial_metrics.csv',index=False)
    print('\nPaired temporal test:',pd.DataFrame(temporal).to_string(index=False),sep='\n')
    print('\nPaired spatial diagnostic:',pd.DataFrame(spatial_metrics).to_string(index=False),sep='\n')
    print(f'Outputs: {out}',flush=True)


if __name__ == '__main__':
    main()
