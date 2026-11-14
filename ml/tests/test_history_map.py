import json

import numpy as np
import pandas as pd
import pytest
from pyproj import Transformer
from shapely import transform
from shapely.geometry import Point, shape
from shapely.ops import unary_union

from taoyuan_ml.reporting import history_map


@pytest.mark.parametrize('value,color', [
    (0, '#00a65a'), (12.4, '#00a65a'), (12.5, '#ffff00'),
    (30.4, '#ffff00'), (30.5, '#ff7e00'), (50.5, '#ff0000'),
    (125.5, '#8f3f97'), (225.5, '#7e0023'), (325.5, '#000000'),
])
def test_documented_color_boundaries(value, color):
    assert history_map.band(value)['color'] == color


def test_metric_cells_cover_city_without_overlaps():
    cells, points = history_map.build_cells()
    to_m = Transformer.from_crs(4326, 3826, always_xy=True).transform
    projected = [transform(shape(cell['geometry']), to_m, interleaved=False) for cell in cells]
    assert len(cells) == len(points) > 100
    for cell, polygon, (_, point) in zip(cells, projected, points.iterrows()):
        props = cell['properties']
        assert props['grid_x'] % 3000 == props['grid_y'] % 3000 == 0
        assert 0 < polygon.area <= 9_000_001
        assert polygon.buffer(.01).covers(Point(*to_m(point.longitude, point.latitude)))
        xmin, ymin, xmax, ymax = polygon.bounds
        assert xmax-xmin <= 3000.01 and ymax-ymin <= 3000.01
    merged = unary_union(projected)
    raw = json.loads((history_map.settings.ROOT_DIR/'frontend-web/src/data/map-assets/TOWN_MOI_1140318-taoyuan.json').read_text(encoding='utf-8'))
    city = transform(shape(raw), to_m, interleaved=False)
    assert merged.symmetric_difference(city).area < 1
    assert abs(sum(p.area for p in projected)-merged.area) < 1


def test_snapshot_uses_model_values_and_rejects_unavailable_hour(tmp_path, monkeypatch):
    monkeypatch.setattr(history_map, 'history_dir', lambda: tmp_path)
    history_map.atomic_json(tmp_path/'catalog.json', {'dates': {'2026-03-31': ['14:00']}})
    feature = {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [121.2, 25.]}, 'properties': {}}
    monkeypatch.setattr(history_map, 'build_cells', lambda: ([feature], pd.DataFrame({'latitude': [25.], 'longitude': [121.2]})))
    monkeypatch.setattr(history_map, 'predict_grid', lambda *args, **kwargs: pd.DataFrame({
        'pm25_xgb': [30.5], 'pm25_final': [99.], 'confidence_level': ['low'], 'nearest_station_distance': [8.]}))
    path = history_map.export_snapshot(pd.Timestamp('2026-03-31 14:00'))
    result = json.loads(path.read_text(encoding='utf-8'))
    assert result['features'][0]['properties']['pm25'] == 30.5
    assert result['features'][0]['properties']['color'] == '#ff7e00'
    assert result['metadata']['method'] == 'xgboost'
    for time in ['2026-03-31 15:00', '2026-03-31 14:30', '2026-03-31T14:00+08:00']:
        with pytest.raises(ValueError):
            history_map.export_snapshot(pd.Timestamp(time))


@pytest.mark.parametrize('invalid', [np.nan, np.inf, -np.inf])
def test_nonfinite_prediction_does_not_write_geojson(tmp_path, monkeypatch, invalid):
    monkeypatch.setattr(history_map, 'history_dir', lambda: tmp_path)
    history_map.atomic_json(tmp_path/'catalog.json', {'dates': {'2026-03-31': ['14:00']}})
    monkeypatch.setattr(history_map, 'build_cells', lambda: ([], pd.DataFrame()))
    monkeypatch.setattr(history_map, 'predict_grid', lambda *a, **k: pd.DataFrame({'pm25_xgb': [invalid]}))
    with pytest.raises(ValueError, match='non-finite'):
        history_map.export_snapshot(pd.Timestamp('2026-03-31 14:00'))
    assert not list(tmp_path.glob('*.geojson'))


@pytest.mark.parametrize('invalid', [np.nan, np.inf, -np.inf])
def test_band_rejects_nonfinite_concentration(invalid):
    with pytest.raises(ValueError, match='Non-finite'):
        history_map.band(invalid)
