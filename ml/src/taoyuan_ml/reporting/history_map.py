"""Hourly PM2.5 GeoJSON on a metre-based grid clipped to Taoyuan."""
import argparse
import json
import math
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
from pyproj import Transformer
from shapely import transform
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

from taoyuan_ml import settings
from taoyuan_ml.data.datasets import read_dataset
from taoyuan_ml.features.definitions import feature_columns
from taoyuan_ml.features.pipeline import add_features
from taoyuan_ml.spatial.predict import predict_grid

SCHEMA_VERSION = 1
CELL_SIZE = 3000
# One-decimal concentration bands from docs/日空氣品質指標.md.
# This is an hourly concentration palette, not a daily AQI calculation.
BANDS = [
    (12.5, '#00a65a', '0–12.4'), (30.5, '#ffff00', '12.5–30.4'),
    (50.5, '#ff7e00', '30.5–50.4'), (125.5, '#ff0000', '50.5–125.4'),
    (225.5, '#8f3f97', '125.5–225.4'), (325.5, '#7e0023', '225.5–325.4'),
    (math.inf, '#000000', '325.5+'),
]


def band(value: float) -> dict:
    if not math.isfinite(value):
        raise ValueError('Non-finite concentration')
    # Explicit half-up rounding before testing documented one-decimal boundaries.
    rounded = math.floor(max(0., value) * 10 + .5) / 10
    for upper, color, label in BANDS:
        if rounded < upper:
            return {'color': color, 'range': label}
    raise ValueError('Non-finite concentration')


def history_dir() -> Path:
    return settings.EXPORTS_DIR / 'history-map-v1'


def atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(value, ensure_ascii=False, allow_nan=False)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                     suffix='.tmp', delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(serialized)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def build_cells(boundary_path: Path | None = None):
    boundary_path = boundary_path or settings.ROOT_DIR / 'frontend-web/src/data/map-assets/TOWN_MOI_1140318-taoyuan.json'
    raw = json.loads(boundary_path.read_text(encoding='utf-8'))
    if raw['type'] == 'FeatureCollection':
        boundary = unary_union([shape(f['geometry']) for f in raw['features']])
    elif raw['type'] == 'Feature':
        boundary = shape(raw['geometry'])
    else:
        boundary = shape(raw)
    to_m = Transformer.from_crs('EPSG:4326', 'EPSG:3826', always_xy=True).transform
    to_ll = Transformer.from_crs('EPSG:3826', 'EPSG:4326', always_xy=True).transform
    boundary_m = transform(boundary, to_m, interleaved=False)
    xmin, ymin, xmax, ymax = boundary_m.bounds
    cells, points = [], []
    for x in range(math.floor(xmin/CELL_SIZE)*CELL_SIZE, math.ceil(xmax), CELL_SIZE):
        for y in range(math.floor(ymin/CELL_SIZE)*CELL_SIZE, math.ceil(ymax), CELL_SIZE):
            square = box(x, y, x+CELL_SIZE, y+CELL_SIZE)
            clipped = square.intersection(boundary_m)
            if clipped.is_empty or clipped.area < 1:
                continue
            # For boundary slivers, sample inside the visible part of the cell.
            point = clipped.representative_point()
            lon, lat = to_ll(point.x, point.y)
            cells.append({'type': 'Feature', 'id': f'{x}_{y}',
                'geometry': mapping(transform(clipped, to_ll, interleaved=False)),
                'properties': {'cell_id': f'{x}_{y}', 'grid_x': x, 'grid_y': y,
                    'cell_size_m': CELL_SIZE, 'visible_area_m2': round(clipped.area, 1)}})
            points.append({'latitude': lat, 'longitude': lon})
    return cells, pd.DataFrame(points)


def export_catalog() -> dict:
    frame = add_features(read_dataset('pm25')).dropna(subset=feature_columns('pm25') + ['pm25'])
    counts = frame.groupby('monitor_date').station_id.nunique()
    times = counts[counts >= 3].index.sort_values()
    dates = {}
    for time in times:
        dates.setdefault(time.strftime('%Y-%m-%d'), []).append(time.strftime('%H:00'))
    result = {'schema_version': SCHEMA_VERSION, 'run_id': settings.RUN_ID,
        'dataset_id': settings.DATASET_ID, 'timezone': 'Asia/Taipei',
        'cell_size_m': CELL_SIZE, 'method': 'xgboost', 'aggregation': 'hourly',
        'dates': dates, 'legend': [{'color': c, 'range': r} for _, c, r in BANDS]}
    atomic_json(history_dir() / 'catalog.json', result)
    return result


def export_snapshot(target: pd.Timestamp) -> Path:
    if pd.isna(target) or target.tzinfo is not None or target != target.floor('h'):
        raise ValueError('Use a whole local hour without a timezone offset (Asia/Taipei).')
    catalog = json.loads((history_dir()/'catalog.json').read_text(encoding='utf-8'))
    if target.strftime('%H:00') not in catalog['dates'].get(target.strftime('%Y-%m-%d'), []):
        raise ValueError('No usable station history for this hour.')
    cells, grid = build_cells()
    predicted = predict_grid(target, grid=grid, include_kriging=False)
    values = predicted.pm25_xgb
    if not np.isfinite(values).all():
        raise ValueError('Model returned non-finite predictions.')
    values = values.clip(lower=0)
    if len(predicted) != len(cells):
        raise ValueError('Prediction count does not match the map cells.')
    for feature, (_, row), value in zip(cells, predicted.iterrows(), values):
        feature['properties'].update(pm25=float(value), **band(float(value)),
            confidence_level=str(row.confidence_level),
            nearest_station_km=float(row.nearest_station_distance))
    result = {'type': 'FeatureCollection', 'features': cells,
        'metadata': {'schema_version': SCHEMA_VERSION, 'run_id': settings.RUN_ID,
            'dataset_id': settings.DATASET_ID, 'timestamp': target.isoformat(),
            'timezone': 'Asia/Taipei', 'unit': 'µg/m³', 'aggregation': 'hourly',
            'method': 'xgboost', 'cell_size_m': CELL_SIZE, 'grid_crs': 'EPSG:3826',
            'note': '小時 PM2.5 空間推估；不是日 AQI、24 小時平均或未來預報。網格值為格內代表點推估，非面積平均。'}}
    path = history_dir() / f'{target:%Y%m%d_%H00}.geojson'
    atomic_json(path, result)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--catalog', action='store_true')
    action.add_argument('--time', help='Local historical hour, e.g. 2026-03-31T14:00')
    args = parser.parse_args()
    if args.catalog:
        result = export_catalog()
        print(f'Catalog: {len(result["dates"])} dates -> {history_dir()}')
    else:
        print(export_snapshot(pd.Timestamp(args.time)))
