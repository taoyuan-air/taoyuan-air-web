import numpy as np
import pandas as pd
from taoyuan_ml.settings import TAOYUAN_BBOX, GRID_RESOLUTION

def build_grid() -> pd.DataFrame:
    lats = np.arange(TAOYUAN_BBOX['lat_min'], TAOYUAN_BBOX['lat_max'], GRID_RESOLUTION)
    lons = np.arange(TAOYUAN_BBOX['lon_min'], TAOYUAN_BBOX['lon_max'], GRID_RESOLUTION)
    lat_grid, lon_grid = np.meshgrid(lats, lons)
    return pd.DataFrame({
        'latitude': lat_grid.ravel(),
        'longitude': lon_grid.ravel(),
    })
