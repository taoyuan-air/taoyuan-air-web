import numpy as np
import pandas as pd
import pytest
from taoyuan_ml.features.pipeline import add_features
from taoyuan_ml.features.definitions import feature_columns
from taoyuan_ml.features.temporal import _add_station_rolling_stats
from taoyuan_ml.features.neighbors import _add_station_neighbor_lags
from taoyuan_ml.settings import VARIABLES


@pytest.mark.parametrize(('variable', 'missing_hour'), [
    ('pm25', None), ('pm25', 4), ('temperature', None),
    ('temperature', 4), ('humidity', None),
])
def test_training_and_inference_features_agree(station_data, variable, missing_hour):
    time = pd.Timestamp('2025-07-01 12:00')
    station_data['is_raining'] = 0
    if missing_hour is not None:
        station_data = station_data[~((station_data.station_id == 'S0') &
            (station_data.monitor_date == time-pd.Timedelta(hours=missing_hour)))]
    value_col = VARIABLES[variable]['value_col']
    engineered = add_features(station_data, variable=variable)
    expected = engineered[engineered.monitor_date == time].set_index('station_id')
    actual = station_data[station_data.monitor_date == time].set_index('station_id').copy()
    for h in VARIABLES[variable]['lag_hours']:
        actual[f'lag_{h}h'] = station_data[station_data.monitor_date == time-pd.Timedelta(hours=h)].set_index('station_id')[value_col]
    actual = _add_station_rolling_stats(actual, station_data, time, value_col)
    actual = _add_station_neighbor_lags(actual, VARIABLES[variable]['lag_hours'])
    cols = [col for col in feature_columns(variable) if col.startswith(('lag_', 'rolling_', 'neighbor'))]
    np.testing.assert_allclose(actual[cols].sort_index(), expected[cols].sort_index())


def test_future_observations_do_not_change_past_features(station_data):
    cutoff = pd.Timestamp('2025-07-01')
    before = add_features(station_data)
    changed = station_data.copy()
    changed.loc[changed.monitor_date > cutoff, 'pm25'] = 99999
    after = add_features(changed)
    pd.testing.assert_frame_equal(before[before.monitor_date <= cutoff], after[after.monitor_date <= cutoff])


def test_lags_use_timestamp_not_previous_row(station_data):
    missing = pd.Timestamp('2025-07-01 11:00')
    frame = station_data[~((station_data.station_id == 'S0') & (station_data.monitor_date == missing))]
    features = add_features(frame)
    assert features[(features.station_id == 'S0') & (features.monitor_date == missing+pd.Timedelta(hours=1))].empty
