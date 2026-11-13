from typing import Optional, Tuple
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from taoyuan_ml.settings import VARIABLES
from taoyuan_ml.features.definitions import FEATURE_COLS, LAG_HOURS
from taoyuan_ml.features.temporal import _calendar_feature_values, _add_station_rolling_stats
from taoyuan_ml.features.neighbors import _add_station_neighbor_lags, _neighbor_lag_hours
_KM_PER_DEG_LAT = 111.0
_KM_PER_DEG_LON = 101.0
_ALL_NEEDED_HOURS = sorted(set([0] + LAG_HOURS + list(range(1, 7))))
_PM25_EXTERNAL_FEATURES = VARIABLES['pm25'].get('external_features', [])

def _build_station_features(
    target_lat: float,
    target_lon: float,
    target_time: pd.Timestamp,
    train_data: pd.DataFrame,
) -> Tuple[Optional[pd.DataFrame], Optional[pd.DataFrame]]:
    """
    Build (st, point_row) from the remaining station data at target_time.

    st        : DataFrame of remaining stations with all feature columns
    point_row : single-row DataFrame matching FEATURE_COLS for the target point

    Returns (None, None) if insufficient stations.
    """
    needed_times = [target_time - pd.Timedelta(hours=h) for h in _ALL_NEEDED_HOURS]
    window = train_data[train_data['monitor_date'].isin(needed_times)]

    def _val(h):
        t   = target_time - pd.Timedelta(hours=h)
        cols = ['station_id', 'latitude', 'longitude', 'pm25']
        if h == 0:
            cols += [col for col in _PM25_EXTERNAL_FEATURES if col in window.columns]
        sub = window[window['monitor_date'] == t][
            cols
        ]
        return sub.set_index('station_id')

    t_vals = {h: _val(h) for h in _ALL_NEEDED_HOURS}

    # Need all LAG_HOURS to be present
    common = t_vals[0].index
    for h in LAG_HOURS:
        common = common.intersection(t_vals[h].index)
    if len(common) < 2:
        return None, None

    st = t_vals[0].loc[common].copy()
    for h in LAG_HOURS:
        st[f'lag_{h}h'] = t_vals[h].loc[common, 'pm25']
    st = st.reset_index()

    # Calendar + cyclic features (same value for all stations at this timestamp)
    for col, value in _calendar_feature_values(target_time).items():
        st[col] = value

    st = _add_station_rolling_stats(st.set_index('station_id'), train_data, target_time, 'pm25')
    st = _add_station_neighbor_lags(st, LAG_HOURS).reset_index()

    # ---- IDW features at the target point ----
    def _idw(col):
        d2 = (st['latitude']  - target_lat) ** 2 + \
             (st['longitude'] - target_lon) ** 2
        d  = np.sqrt(d2).clip(1e-6)
        w  = 1.0 / d ** 2
        vals = st[col].fillna(st[col].mean())  # fallback for any NaN
        return float((w * vals).sum() / w.sum())

    # Nearest-station neighbor lags at target point
    st_km = np.column_stack([
        st['latitude'].values  * _KM_PER_DEG_LAT,
        st['longitude'].values * _KM_PER_DEG_LON,
    ])
    tree   = cKDTree(st_km)
    tgt_km = np.array([[target_lat * _KM_PER_DEG_LAT, target_lon * _KM_PER_DEG_LON]])
    k      = min(2, len(st))
    _, idxs = tree.query(tgt_km, k=k)
    idxs = idxs.ravel()

    point = {
        'latitude':     target_lat,
        'longitude':    target_lon,
        **_calendar_feature_values(target_time),
    }
    for h in LAG_HOURS:
        point[f'lag_{h}h'] = _idw(f'lag_{h}h')
    for col in _PM25_EXTERNAL_FEATURES:
        if col in st.columns:
            point[col] = _idw(col)
    for col in ['rolling_mean_3h', 'rolling_mean_6h', 'rolling_std_6h']:
        point[col] = _idw(col)
    for i in range(2):
        nbr_idx = idxs[min(i, len(idxs) - 1)]
        for h in _neighbor_lag_hours(LAG_HOURS):
            point[f'neighbor{i+1}_lag_{h}h'] = float(st[f'lag_{h}h'].iloc[nbr_idx])

    point_row = pd.DataFrame([point])[FEATURE_COLS]
    return st, point_row
