"""Extend validated regional model inputs through 2026 without changing weights.

Creates an isolated deployment run. Future observations are inference inputs,
not training examples, preserving the study's independent 2025 test results.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ml/src'))
sys.path.insert(0,str(ROOT/'scripts'))


def weather_complete_counts(frame, columns):
    """Count valid feature rows without newer GroupBy.apply keyword arguments."""
    return frame[columns].notna().all(axis=1).groupby(frame['station_id']).sum()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--parent-run',required=True)
    parser.add_argument('--base-dataset',required=True)
    parser.add_argument('--run-id',required=True)
    parser.add_argument('--hourly-data',type=Path,required=True)
    parser.add_argument('--env-file',type=Path,default=ROOT/'backend/.env')
    args=parser.parse_args()
    os.environ.update(ML_ENV_FILE=str(args.env_file.resolve()),OMP_NUM_THREADS='4',OPENBLAS_NUM_THREADS='4')
    import pandas as pd
    from pyproj import Transformer
    from taoyuan_ml import settings
    from taoyuan_ml.models.artifacts import sha256,record_dataset,write_json,prepare_run,set_run_status
    from taoyuan_ml.data.export import _add_pm25_meteo_features
    from taoyuan_ml.data.database import connect
    from train_regional_pm25 import concentration

    for value in [args.parent_run,args.base_dataset,args.run_id]: settings.validate_id(value)
    parent=settings.DATA_ROOT/'models'/args.parent_run
    parent_metadata=json.loads((parent/'metadata.json').read_text(encoding='utf-8'))
    if parent_metadata['status']!='complete': raise ValueError('Parent training is not complete.')
    if sha256(parent/'config.toml')!=parent_metadata['config_sha256']: raise ValueError('Parent config changed.')
    parent_data=settings.DATA_ROOT/'processed/ml'/parent_metadata['dataset_id']/'pm25_hourly.parquet'
    if sha256(parent_data)!=parent_metadata['dataset_manifest']['files'][parent_data.name]['sha256']:
        raise ValueError('Parent dataset changed.')
    old=pd.read_parquet(parent_data)
    base_dir=settings.DATA_ROOT/'processed/ml'/args.base_dataset
    base_manifest=json.loads((base_dir/'manifest.json').read_text(encoding='utf-8'))
    base_path=base_dir/'pm25_hourly.parquet'
    if sha256(base_path)!=base_manifest['files'][base_path.name]['sha256']: raise ValueError('Base dataset changed.')
    base=pd.read_parquet(base_path)
    target_2026=base[base.monitor_date>='2026-01-01'].copy()
    meta=json.loads((ROOT/'ml/configs/regional_stations.json').read_text(encoding='utf-8'))
    stations={s['station_id']:s for s in meta['stations']}
    to_wgs=Transformer.from_crs(meta['coordinate_crs'],4326,always_xy=True)
    rows=[];sources=[];coverage=[]
    for path in sorted(args.hourly_data.glob('aqx_p_*.json')):
        payload=json.loads(path.read_text(encoding='utf-8'))
        if sha256(path)!=path.with_suffix('.sha256').read_text().strip(): raise ValueError('Raw hourly checksum mismatch.')
        sid=payload['station_id']; station=stations[sid]
        lon,lat=to_wgs.transform(station['longitude'],station['latitude'])
        accepted=0
        for record in payload['records']:
            if record['siteid']!=sid or record['itemengname']!='PM2.5' or record['sitename']!=station['station_name']:
                raise ValueError('Raw station/pollutant identity mismatch.')
            timestamp=pd.Timestamp(record['monitordate'])
            if timestamp.year!=2026 or timestamp!=timestamp.floor('h'): raise ValueError('Unexpected raw timestamp.')
            value=concentration(record['concentration'])
            if value is None: continue
            rows.append({**station,'longitude':lon,'latitude':lat,'source':'moe','altitude':None,
                         'monitor_date':timestamp,'pm25':value});accepted+=1
        coverage.append({'station_id':sid,'station_name':station['station_name'],'downloaded_hours':len(payload['records']),
            'valid_pm25_hours':accepted,'first':payload['first'],'last':payload['last'],
            'identical_duplicates_removed':payload['quality']['identical_duplicate_records_removed'],
            'conflicting_hours_excluded':len(payload['quality']['conflicting_hours_excluded'])})
        sources.append({'path':str(path.resolve()),'sha256':sha256(path),'url':payload['source_url']})
    added=pd.DataFrame(rows)
    if added.empty or set(added.station_id)!=set(stations): raise ValueError('Missing 2026 neighboring stations.')
    with connect() as conn: added=_add_pm25_meteo_features(conn,added)
    merged=pd.concat([old,target_2026,added],ignore_index=True).sort_values(['monitor_date','station_id'])
    if merged.duplicated(['station_id','monitor_date']).any(): raise ValueError('Duplicate deployment station/hour.')
    pd.testing.assert_frame_equal(
        old.sort_values(['station_id','monitor_date']).reset_index(drop=True),
        merged[merged.monitor_date<'2026-01-01'][old.columns].sort_values(['station_id','monitor_date']).reset_index(drop=True),
        check_dtype=False)
    settings.DATASET_ID=args.run_id
    settings.DATASET_DIR=settings.DATA_ROOT/'processed/ml'/args.run_id
    settings.RUN_ID=args.run_id
    settings.MODELS_DIR=settings.DATA_ROOT/'models'/args.run_id
    settings.EXPORTS_DIR=settings.DATA_ROOT/'exports/ml'/args.run_id
    settings.CONFIG=settings.read_config(parent/'config.toml',snapshot=True)
    settings.DATASET_DIR.mkdir(parents=True,exist_ok=False)
    settings.EXPORTS_DIR.mkdir(parents=True,exist_ok=False)
    path=settings.DATASET_DIR/'pm25_hourly.parquet'
    merged.to_parquet(path,index=False);record_dataset('pm25',merged,path)
    manifest_path=settings.DATASET_DIR/'manifest.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['sources']=['Parent regional dataset: '+parent_metadata['dataset_id'],'Original baseline dataset: '+args.base_dataset]+sources
    manifest['inference_extension']={'parent_run':args.parent_run,'new_observations_are_training_data':False}
    write_json(manifest_path,manifest)
    prepare_run(['pm25'])
    try:
        for name in ['xgb_pm25.json','feature_schema.json']:
            shutil.copyfile(parent/name,settings.MODELS_DIR/name)
        metadata_path=settings.MODELS_DIR/'metadata.json'
        metadata=json.loads(metadata_path.read_text(encoding='utf-8'))
        metadata.update(run_type='inference-extension',training_run_id=args.parent_run,
            training_dataset_id=parent_metadata['dataset_id'],training_metadata=parent_metadata,
            weights_sha256=sha256(settings.MODELS_DIR/'xgb_pm25.json'),
            note='Validated parent model weights unchanged; only historical inference inputs extended through 2026.')
        assert metadata['weights_sha256']==sha256(parent/'xgb_pm25.json')
        write_json(metadata_path,metadata);set_run_status('complete')
    except BaseException:
        set_run_status('failed');raise
    pd.DataFrame(coverage).to_csv(settings.EXPORTS_DIR/'neighbor_2026_coverage.csv',index=False)
    weather=weather_complete_counts(added, settings.VARIABLES['pm25']['external_features'])
    print('2026 weather-complete neighbor hours:',weather.to_dict(),flush=True)
    print(pd.DataFrame(coverage).to_string(index=False),flush=True)
    print(f'Deployment run {args.run_id}: {len(merged):,} rows, {merged.station_id.nunique()} stations; validated weights preserved.',flush=True)


if __name__=='__main__': main()
