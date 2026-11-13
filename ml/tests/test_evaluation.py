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
