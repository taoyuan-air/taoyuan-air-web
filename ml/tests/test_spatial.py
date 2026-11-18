import numpy as np
import pandas as pd
import pytest
from taoyuan_ml.evaluation.calibration import save_calibration
from taoyuan_ml.spatial.uncertainty import load_thresholds, assign_confidence_level
from taoyuan_ml.spatial.interpolation import _idw, kriging_residual


def test_calibration_survives_reload(storage):
    save_calibration({'high_dist_km': 6.0, 'med_dist_km': 10.0, 'corr': np.nan})
    load_thresholds()
    frame = pd.DataFrame({'nearest_station_distance':[5.0,9.0,12.0],
                          'station_count_within_5km':[2,0,0], 'station_count_within_10km':[3,2,0]})
    assert assign_confidence_level(frame).confidence_level.tolist() == ['high','medium','low']


def test_idw_constant_and_exact_station_values():
    grid = pd.DataFrame({'latitude':[25.0,25.5], 'longitude':[121.0,121.5]}, index=[5,9])
    stations = pd.DataFrame({'latitude':[25.0,26.0], 'longitude':[121.0,122.0], 'value':[10.0,30.0]})
    result = _idw(grid, stations, 'value')
    np.testing.assert_allclose(result, [10.0,20.0], atol=1e-8)


def test_constant_kriging_residuals_need_no_variogram_fit():
    stations = pd.DataFrame({'latitude':[25.,25.1,25.2], 'longitude':[121.,121.1,121.3]})
    grid = pd.DataFrame({'latitude':[25.,25.05], 'longitude':[121.05,121.15]})
    for value in (0.0, 2.5):
        stations['residual'] = value
        correction, variance = kriging_residual(grid, stations)
        np.testing.assert_allclose(correction, value)
        np.testing.assert_allclose(variance, 0.0)


def test_pm25_calibration_does_not_leak_into_other_variables(storage):
    save_calibration({'high_dist_km': 6., 'med_dist_km': 10., 'corr': 0.8})
    load_thresholds('pm25')
    grid = pd.DataFrame({'nearest_station_distance':[5.],
        'station_count_within_5km':[2], 'station_count_within_10km':[3]})
    assert assign_confidence_level(grid).confidence_level.tolist() == ['high']
    load_thresholds('humidity')
    assert assign_confidence_level(grid).confidence_level.tolist() == ['medium']


def test_non_pm25_grid_uses_all_six_rolling_hours(storage, station_data, monkeypatch):
    from taoyuan_ml.spatial import predict
    from taoyuan_ml.features.temporal import _add_station_rolling_stats
    station_data['is_raining'] = 0
    monkeypatch.setattr(predict, 'load_station_data', lambda variable: station_data)
    class Model:
        def predict(self, frame):
            return np.zeros(len(frame))
    monkeypatch.setattr(predict, 'load_model', lambda *args: Model())
    monkeypatch.setattr(predict, 'kriging_residual', lambda grid, stations: (np.zeros(len(grid)), np.zeros(len(grid))))
    monkeypatch.setattr(predict, 'build_grid', lambda: pd.DataFrame({'latitude':[25.01], 'longitude':[121.12]}))
    checked = []
    def check_window(stations, window, time, column):
        expected = _add_station_rolling_stats(stations, station_data, time, column)
        actual = _add_station_rolling_stats(stations, window, time, column)
        pd.testing.assert_frame_equal(actual, expected)
        checked.append(True)
        return actual
    monkeypatch.setattr(predict, '_add_station_rolling_stats', check_window)
    predict.predict_grid(pd.Timestamp('2025-07-01 12:00'), 'humidity')
    assert checked


def test_xgboost_only_prediction_skips_kriging(storage, station_data, monkeypatch):
    from taoyuan_ml.spatial import predict
    monkeypatch.setattr(predict, 'load_station_data', lambda variable: station_data)
    calls = []
    class Model:
        def predict(self, frame):
            calls.append(len(frame))
            return np.full(len(frame), 12.5)
    monkeypatch.setattr(predict, 'load_model', lambda *args: Model())
    monkeypatch.setattr(predict, 'kriging_residual', lambda *args: pytest.fail('Kriging must not run'))
    grid = pd.DataFrame({'latitude': [25.01], 'longitude': [121.12]}, index=[42])
    original = grid.copy()
    result = predict.predict_grid(pd.Timestamp('2025-07-01 12:00'), grid=grid, include_kriging=False)
    assert result.pm25_xgb.tolist() == [12.5]
    assert result.index.tolist() == [42]
    assert 'pm25_kriging' not in result and 'pm25_final' not in result
    assert calls == [1]
    pd.testing.assert_frame_equal(grid, original)
