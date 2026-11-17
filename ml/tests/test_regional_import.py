import importlib.util
from pathlib import Path

import pandas as pd
import pytest


def module(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[2]/'scripts'/f'{name}.py')
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def test_annual_pm25_rejects_quality_flags_and_preserves_local_hours():
    study = module('train_regional_pm25')
    header = '測站,日期,測項,' + ','.join(f'{h:02d}' for h in range(24))
    values = ['12.5', '18#', '20*', '21x', '-999', 'nan', 'inf', ''] + ['15']*16
    text = header+'\n林口,2025/12/31 00:00:00,PM2.5,'+','.join(values)+'\n'
    rows, rejected = study.read_station_csv(text, {'station_id':'9','station_name':'林口'})
    assert rejected == 7 and len(rows) == 17
    assert rows[0]['monitor_date'] == pd.Timestamp('2025-12-31 00:00')
    assert rows[-1]['monitor_date'] == pd.Timestamp('2025-12-31 23:00')
    assert rows[0]['pm25'] == 12.5
    with pytest.raises(ValueError, match='name mismatch'):
        study.read_station_csv(text, {'station_id':'22','station_name':'湖口'})


def test_independent_test_never_enters_training_or_early_stopping():
    study = module('train_regional_pm25')
    dates = pd.to_datetime(['2025-06-30 23:00','2025-07-01','2025-09-30 23:00','2025-10-01','2025-12-31 23:00','2026-01-01'],format='mixed')
    frame = pd.DataFrame([{'station_id':sid,'monitor_date':time} for sid in ['target','neighbor'] for time in dates])
    train, val, test = study.temporal_partitions(frame,['target'],*map(pd.Timestamp,['2025-07-01','2025-10-01','2026-01-01']))
    assert set(train.station_id) == {'target','neighbor'}
    assert val.station_id.tolist() == ['target','target']
    assert test.station_id.tolist() == ['target','target']
    assert train.monitor_date.max() < val.monitor_date.min() < test.monitor_date.min()
    assert test.monitor_date.max() < pd.Timestamp('2026-01-01')


def test_official_index_links_select_only_requested_regions():
    download = module('download_moe_regional_history')
    text = '<table><tr><td>北部空品區</td><td><a href="https://drive.google.com/file/d/north_id/view">連結</a></td></tr><tr><td>竹苗空品區</td><td><a href="https://drive.google.com/file/d/hsinchu_id/view">連結</a></td></tr><tr><td>全部</td><td><a href="https://drive.google.com/file/d/all_id/view">連結</a></td></tr></table>'
    assert download.regional_links(text) == {'north':'north_id','hsinchu-miaoli':'hsinchu_id'}
    with pytest.raises(RuntimeError):
        download.regional_links('<table></table>')


def test_hourly_duplicates_are_merged_and_conflicts_excluded():
    download = module('download_moe_neighbor_hours')
    rows=[{'monitordate':'2026-01-01 00:00','concentration':'12'},
          {'monitordate':'2026-01-01 00:00','concentration':'12'},
          {'monitordate':'2026-01-01 01:00','concentration':'13'},
          {'monitordate':'2026-01-01 01:00','concentration':'14'}]
    clean, quality=download.deduplicate_records(rows)
    assert clean == rows[:1]
    assert quality['identical_duplicate_records_removed']==1
    assert quality['conflicting_hours_excluded']=={'2026-01-01 01:00':['13','14']}


def test_hourly_download_splits_capped_periods_without_clipping():
    from datetime import datetime
    download=module('download_moe_neighbor_hours')
    class Response:
        status_code=200
        def __init__(self,rows): self.rows=rows
        def json(self): return self.rows
    class Session:
        calls=0
        def get(self,*args,**kwargs):
            self.calls+=1
            if self.calls==1: return Response([{}]*1000)
            day='2026-01-01' if self.calls==2 else '2026-01-03'
            return Response([{'siteid':'9','itemengname':'PM2.5','monitordate':day+' 00:00','concentration':'12'}])
    session=Session()
    result=download.fetch_period(session,'test-key','197','9',datetime(2026,1,1),datetime(2026,1,5))
    assert session.calls==3 and len(result)==2


def test_hourly_error_payload_is_not_treated_as_empty_data():
    from datetime import datetime
    from types import SimpleNamespace
    download = module('download_moe_neighbor_hours')
    session = SimpleNamespace(get=lambda *a, **k: SimpleNamespace(status_code=200, json=lambda: {'error': 'invalid filter'}))
    with pytest.raises(ValueError, match='response type'):
        download.fetch_period(session, 'unused', '197', '9', datetime(2026,1,1), datetime(2026,2,1))


def test_hourly_request_failure_does_not_expose_key():
    from datetime import datetime
    import requests
    download = module('download_moe_neighbor_hours')
    key = 'private-test-token'
    class Session:
        def get(self, *args, **kwargs):
            raise requests.ConnectionError('https://example.test/?api_key=' + key)
    with pytest.raises(RuntimeError) as error:
        download.fetch_period(Session(), key, '197', '9', datetime(2026,1,1), datetime(2026,2,1))
    assert key not in str(error.value)
    assert error.value.__suppress_context__


def test_hourly_resume_requires_matching_period_and_checksum(tmp_path):
    import hashlib
    import json
    download = module('download_moe_neighbor_hours')
    path = tmp_path/'aqx_p_197.json'
    path.write_text(json.dumps({'station_id': '9', 'dataset': 'AQX_P_197', 'requested_end_exclusive': '2026-11-15'}))
    path.with_suffix('.sha256').write_text(hashlib.sha256(path.read_bytes()).hexdigest())
    download.verify_cached_download(path, '2026-11-15', '9', '197')
    with pytest.raises(ValueError, match='period or station'):
        download.verify_cached_download(path, '2026-11-16', '9', '197')
    path.write_text('{}')
    with pytest.raises(ValueError, match='checksum'):
        download.verify_cached_download(path, '2026-11-15', '9', '197')


@pytest.mark.parametrize('before,after,direction', [(4.,3.,'降低'), (3.,4.,'增加'), (3.,3.,'變化'), (0.,0.,'MAE')])
def test_report_conclusions_follow_actual_scores(before, after, direction):
    report = module('report_regional_pm25')
    assert direction in report.mae_change(before, after)


@pytest.mark.parametrize('invalid', [
    '2026-11-15T12:00', '2026-11-15T00:00+08:00', '2026-02-30',
    '2026-01-01', '2027-01-02', '20261115',
])
def test_hourly_download_rejects_unrepresentable_end_dates(invalid):
    import argparse
    download = module('download_moe_neighbor_hours')
    with pytest.raises(argparse.ArgumentTypeError):
        download.exclusive_end(invalid)


def test_hourly_download_accepts_exclusive_year_boundary():
    from datetime import datetime
    download = module('download_moe_neighbor_hours')
    assert download.exclusive_end('2027-01-01') == datetime(2027, 1, 1)
    assert download.exclusive_end('2026-11-15') == datetime(2026, 11, 15)


def test_extension_counts_weather_complete_rows_with_arbitrary_index():
    extension = module('extend_regional_inference')
    frame = pd.DataFrame({
        'station_id': ['a', 'a', 'b'], 'temperature': [20., None, 22.],
        'humidity': [60., 61., None],
    }, index=[10, 20, 30])
    assert extension.weather_complete_counts(frame, ['temperature', 'humidity']).to_dict() == {'a': 1, 'b': 0}


@pytest.mark.parametrize('invalid', [float('nan'), float('inf'), float('-inf')])
def test_regional_evaluation_rejects_invalid_predictions_before_clipping(invalid):
    from taoyuan_ml.evaluation.metrics import nonnegative_predictions
    with pytest.raises(ValueError, match='non-finite'):
        nonnegative_predictions([1., invalid])


def test_regional_evaluation_clips_only_finite_negative_predictions():
    from taoyuan_ml.evaluation.metrics import nonnegative_predictions
    assert nonnegative_predictions([-2., 0., 12.5]).tolist() == [0., 0., 12.5]


def test_low_pollution_metrics_can_be_saved_as_strict_json():
    import json
    import numpy as np
    from taoyuan_ml.evaluation.metrics import _metrics
    study = module('train_regional_pm25')
    # Constant, low-pollution targets legitimately have undefined R² and recall.
    metrics = _metrics(np.array([10., 10.]), np.array([9., 11.]), 35.)
    result = json.loads(json.dumps(study.metrics_for_json(metrics), allow_nan=False))
    assert result['r2'] is None and result['high_recall'] is None
    assert result['mae'] == result['rmse'] == 1.
