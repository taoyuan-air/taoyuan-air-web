import numpy as np
import pandas as pd
from taoyuan_ml.evaluation import comparison, spatial_validation


class Model:
    def predict(self, frame):
        return np.zeros(len(frame))


def test_short_evaluation_range_preserves_historical_features(station_data, monkeypatch):
    monkeypatch.setattr(comparison, '_kriging_correction', lambda *args: 0.)
    monkeypatch.setattr(spatial_validation, '_kriging_correction', lambda *args: 0.)
    start = pd.Timestamp('2025-07-01 12:00')
    end = start + pd.Timedelta(hours=5)
    loo = spatial_validation.run_loo(station_data, Model(), (start,end), max_hours=10)
    assert len(loo) == 4
    assert loo.sample_count.tolist() == [6] * 4
    report = comparison.run_comparison(station_data, Model(), (start,end), max_hours=10)
    assert len(report) == 3
    assert report.n_samples.tolist() == [24] * 3


def test_point_rolling_uses_bounded_window_with_identical_values(station_data, monkeypatch):
    from taoyuan_ml.evaluation import point_features
    from taoyuan_ml.features.temporal import _add_station_rolling_stats
    target = pd.Timestamp('2025-07-01 12:00')
    remaining = station_data[station_data.station_id != 'S0']
    observed_sizes = []
    def bounded(stations, window, time, column):
        assert window.monitor_date.nunique() <= 9
        observed_sizes.append(len(window))
        actual = _add_station_rolling_stats(stations, window, time, column)
        expected = _add_station_rolling_stats(stations, remaining, time, column)
        pd.testing.assert_frame_equal(actual, expected)
        return actual
    monkeypatch.setattr(point_features, '_add_station_rolling_stats', bounded)
    stations, point = point_features._build_station_features(25.,121.1,target,remaining)
    assert stations is not None and point is not None
    assert observed_sizes and max(observed_sizes) < len(remaining)
