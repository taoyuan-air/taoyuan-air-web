"""
Spatial uncertainty metrics for PM2.5 grid predictions.

Provides two public functions:
    compute_spatial_uncertainty(grid, stations) -> grid with distance columns
    assign_confidence_level(grid)               -> grid with confidence_level column
"""

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

# Taoyuan is near 25°N:  1° lat ≈ 111 km,  1° lon ≈ 101 km
_KM_PER_DEG_LAT = 111.0
_KM_PER_DEG_LON = 101.0

# Rule-based thresholds (km) — can be recalibrated after LOO analysis
_HIGH_DIST_KM   = 3.0
_HIGH_COUNT_5KM = 2
_MED_DIST_KM    = 8.0
_MED_COUNT_10KM = 2


def _latlon_to_km(df: pd.DataFrame) -> np.ndarray:
    """Return (N, 2) array of [lat_km, lon_km] for KD-tree distance queries."""
    return np.column_stack([
        df['latitude'].values  * _KM_PER_DEG_LAT,
        df['longitude'].values * _KM_PER_DEG_LON,
    ])


def compute_spatial_uncertainty(
    grid: pd.DataFrame,
    stations: pd.DataFrame,
) -> pd.DataFrame:
    """
    Add spatial uncertainty columns to *grid* based on *stations*.

    New columns added (in-place):
        nearest_station_distance    (km)
        station_count_within_3km
        station_count_within_5km
        station_count_within_10km
        mean_distance_to_3_nearest  (km)

    Parameters
    ----------
    grid     : DataFrame with at least 'latitude' and 'longitude'
    stations : DataFrame with at least 'latitude' and 'longitude'

    Returns
    -------
    The same *grid* DataFrame with the new columns filled.
    """
    grid_km    = _latlon_to_km(grid)
    station_km = _latlon_to_km(stations)

    tree = cKDTree(station_km)

    # nearest station distance
    dist_to_nearest, _ = tree.query(grid_km, k=1)
    grid = grid.copy()
    grid['nearest_station_distance'] = dist_to_nearest

    # station counts within radii
    for radius in (3, 5, 10):
        counts = tree.query_ball_point(grid_km, r=radius, return_length=True)
        grid[f'station_count_within_{radius}km'] = np.array(counts, dtype=int)

    # mean distance to 3 nearest stations (or fewer if total stations < 3)
    k = min(3, len(stations))
    if k > 0:
        dists_k, _ = tree.query(grid_km, k=k)
        if k == 1:
            dists_k = dists_k.reshape(-1, 1)
        grid['mean_distance_to_3_nearest'] = dists_k.mean(axis=1)
    else:
        grid['mean_distance_to_3_nearest'] = np.nan

    return grid


def assign_confidence_level(grid: pd.DataFrame) -> pd.DataFrame:
    """
    Add a 'confidence_level' column ('high' / 'medium' / 'low') to *grid*.

    Requires that compute_spatial_uncertainty() has already been called.
    """
    grid = grid.copy()

    high_mask = (
        (grid['nearest_station_distance'] <= _HIGH_DIST_KM) &
        (grid['station_count_within_5km'] >= _HIGH_COUNT_5KM)
    )
    med_mask = (
        ~high_mask &
        (grid['nearest_station_distance'] <= _MED_DIST_KM) &
        (grid['station_count_within_10km'] >= _MED_COUNT_10KM)
    )

    grid['confidence_level'] = 'low'
    grid.loc[med_mask,  'confidence_level'] = 'medium'
    grid.loc[high_mask, 'confidence_level'] = 'high'

    return grid


def update_thresholds(
    high_dist_km: float   = _HIGH_DIST_KM,
    high_count_5km: int   = _HIGH_COUNT_5KM,
    med_dist_km: float    = _MED_DIST_KM,
    med_count_10km: int   = _MED_COUNT_10KM,
) -> None:
    """Overwrite module-level threshold constants (called after LOO calibration)."""
    global _HIGH_DIST_KM, _HIGH_COUNT_5KM, _MED_DIST_KM, _MED_COUNT_10KM
    _HIGH_DIST_KM   = high_dist_km
    _HIGH_COUNT_5KM = high_count_5km
    _MED_DIST_KM    = med_dist_km
    _MED_COUNT_10KM = med_count_10km
