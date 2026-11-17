import numpy as np
import pandas as pd
from pykrige.ok import OrdinaryKriging

def _idw(grid: pd.DataFrame, stations: pd.DataFrame, col: str, power: float = 2.0) -> np.ndarray:
    """Estimate a station column at grid points via inverse-distance weighting."""
    vals = pd.to_numeric(stations[col], errors='coerce')
    if vals.isna().all():
        raise ValueError(f"Cannot IDW interpolate {col}: all station values are NaN")
    vals = vals.fillna(vals.mean())

    result = np.zeros(len(grid))
    for i, (_, row) in enumerate(grid.iterrows()):
        d2 = (stations['latitude'] - row['latitude']) ** 2 + (
            stations['longitude'] - row['longitude']
        ) ** 2
        d = np.sqrt(d2).clip(1e-6)
        w = 1.0 / d ** power
        result[i] = (w * vals).sum() / w.sum()
    return result

def _idw_correction(
    target_lat: float,
    target_lon: float,
    st: pd.DataFrame,
    power: float = 2.0,
) -> float:
    """IDW interpolation of station residuals to target point."""
    d2 = (st['latitude']  - target_lat) ** 2 + \
         (st['longitude'] - target_lon) ** 2
    d  = np.sqrt(d2).clip(1e-6)
    w  = 1.0 / d ** power
    return float((w * st['residual']).sum() / w.sum())

def _kriging_correction(
    target_lat: float,
    target_lon: float,
    st: pd.DataFrame,
) -> float:
    """Ordinary Kriging interpolation of station residuals to target point."""
    try:
        point = pd.DataFrame({'latitude': [target_lat], 'longitude': [target_lon]})
        corr, _ = kriging_residual(point, st)
        return float(corr[0])
    except Exception:
        return 0.0


def kriging_residual(grid: pd.DataFrame, stations: pd.DataFrame):
    if stations.empty:
        raise ValueError('Kriging requires station residuals.')
    residuals = stations['residual'].to_numpy(dtype=float)
    # A constant field has no variogram to fit. PyKrige's optimizer rejects
    # zero variance; its interpolation is simply the same constant everywhere.
    if np.isfinite(residuals).all() and np.all(residuals == residuals[0]):
        return np.full(len(grid), residuals[0]), np.zeros(len(grid))
    model = OrdinaryKriging(
        stations['longitude'].values, stations['latitude'].values,
        stations['residual'].values, variogram_model='spherical',
        verbose=False, enable_plotting=False,
    )
    return model.execute('points', grid['longitude'].values, grid['latitude'].values)
