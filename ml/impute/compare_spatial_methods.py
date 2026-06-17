"""
Compare spatial residual-correction methods using LOO cross-validation.

Methods compared:
  xgb_only   : XGBoost trend, no residual correction
  xgb_idw    : XGBoost + IDW residual correction
  xgb_kriging: XGBoost + Ordinary Kriging residual correction (current default)

Evaluation metric: Leave-One-Station-Out MAE / RMSE / Bias / High-pollution recall

Usage:
    cd ml
    python -m impute.compare_spatial_methods
    python -m impute.compare_spatial_methods --time-range "2024-06-01" "2024-06-30"
    python -m impute.compare_spatial_methods --threshold 35 --output method_compare.csv
"""

import argparse
import sys
from pathlib import Path
from typing import Optional, Tuple

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
from pykrige.ok import OrdinaryKriging
from scipy.spatial import cKDTree
from xgboost import XGBRegressor

from config import EXPORTS_DIR, MODELS_DIR, XGB_PARAMS
from impute.features import FEATURE_COLS, LAG_HOURS, find_nearest_stations

_KM_PER_DEG_LAT = 111.0
_KM_PER_DEG_LON = 101.0

_ROLLING_EXTRA_HOURS = [4, 5]
_ALL_NEEDED_HOURS = sorted(set([0] + LAG_HOURS + _ROLLING_EXTRA_HOURS))


def load_model() -> XGBRegressor:
    path = MODELS_DIR / 'xgb_pm25.json'
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}")
    model = XGBRegressor(**XGB_PARAMS)
    model.load_model(path)
    return model


def load_station_data() -> pd.DataFrame:
    path = EXPORTS_DIR / 'pm25_hourly.parquet'
    if not path.exists():
        raise FileNotFoundError(f"Parquet not found: {path}")
    df = pd.read_parquet(path)
    df['monitor_date'] = pd.to_datetime(df['monitor_date'])
    return df


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
        ok = OrdinaryKriging(
            st['longitude'].values,
            st['latitude'].values,
            st['residual'].values,
            variogram_model='spherical',
            verbose=False,
            enable_plotting=False,
        )
        corr, _ = ok.execute('points',
                             np.array([target_lon]),
                             np.array([target_lat]))
        return float(corr[0])
    except Exception:
        return 0.0


def _build_station_df(
    target_lat: float,
    target_lon: float,
    target_time: pd.Timestamp,
    train_data: pd.DataFrame,
) -> Tuple[Optional[pd.DataFrame], Optional[float]]:
    """
    Build a station DataFrame and the XGBoost prediction at the target point.

    Returns (st_with_residuals, pm25_xgb) or (None, None) if insufficient data.
    st includes: all FEATURE_COLS, pm25_xgb, residual columns.
    """
    needed_times = [target_time - pd.Timedelta(hours=h) for h in _ALL_NEEDED_HOURS]
    window = train_data[train_data['monitor_date'].isin(needed_times)]

    def _val(h):
        t   = target_time - pd.Timedelta(hours=h)
        sub = window[window['monitor_date'] == t][
            ['station_id', 'latitude', 'longitude', 'pm25']
        ]
        return sub.set_index('station_id')

    t_vals = {h: _val(h) for h in _ALL_NEEDED_HOURS}

    common = t_vals[0].index
    for h in LAG_HOURS:
        common = common.intersection(t_vals[h].index)
    if len(common) < 2:
        return None, None

    st = t_vals[0].loc[common].copy()
    for h in LAG_HOURS:
        st[f'lag_{h}h'] = t_vals[h].loc[common, 'pm25']
    st = st.reset_index()

    # Calendar + cyclic features
    st['hour']        = target_time.hour
    st['weekday']     = target_time.weekday()
    st['month']       = target_time.month
    st['sin_hour']    = np.sin(2 * np.pi * target_time.hour      / 24)
    st['cos_hour']    = np.cos(2 * np.pi * target_time.hour      / 24)
    st['sin_month']   = np.sin(2 * np.pi * target_time.month     / 12)
    st['cos_month']   = np.cos(2 * np.pi * target_time.month     / 12)
    st['sin_weekday'] = np.sin(2 * np.pi * target_time.weekday() / 7)
    st['cos_weekday'] = np.cos(2 * np.pi * target_time.weekday() / 7)

    # Rolling stats per station
    st = st.set_index('station_id')
    for sid in st.index:
        pm25_6h = []
        for h in range(1, 7):
            t_h  = target_time - pd.Timedelta(hours=h)
            mask = (
                (train_data['station_id'] == sid) &
                (train_data['monitor_date'] == t_h)
            )
            v = train_data.loc[mask, 'pm25'].values
            pm25_6h.append(float(v[0]) if len(v) > 0 else np.nan)
        arr = np.array(pm25_6h, dtype=float)
        v3  = arr[:3][~np.isnan(arr[:3])]
        v6  = arr[~np.isnan(arr)]
        st.loc[sid, 'rolling_mean_3h'] = np.mean(v3) if len(v3) > 0 else np.nan
        st.loc[sid, 'rolling_mean_6h'] = np.mean(v6) if len(v6) > 0 else np.nan
        st.loc[sid, 'rolling_std_6h']  = (
            float(np.std(v6, ddof=1)) if len(v6) >= 2 else 0.0
        )
    st = st.reset_index()

    # Neighbor lags
    if len(st) >= 2:
        meta      = st[['station_id', 'latitude', 'longitude']].copy()
        neighbors = find_nearest_stations(meta, n=2)
        st = st.set_index('station_id')
        for i in range(1, 3):
            col_1h  = f'neighbor{i}_lag_1h'
            col_24h = f'neighbor{i}_lag_24h'
            st[col_1h]  = np.nan
            st[col_24h] = np.nan
            for sid, nbrs in neighbors.items():
                if len(nbrs) < i:
                    continue
                nbr = nbrs[i - 1]
                if nbr in st.index:
                    st.loc[sid, col_1h]  = st.loc[nbr, 'lag_1h']
                    st.loc[sid, col_24h] = st.loc[nbr, 'lag_24h']
        st = st.reset_index()
    else:
        for i in range(1, 3):
            st[f'neighbor{i}_lag_1h']  = np.nan
            st[f'neighbor{i}_lag_24h'] = np.nan

    # IDW + nearest-station features for target point
    def _idw_lag(col):
        d2 = (st['latitude']  - target_lat) ** 2 + \
             (st['longitude'] - target_lon) ** 2
        d  = np.sqrt(d2).clip(1e-6)
        w  = 1.0 / d ** 2
        vals = st[col].fillna(st[col].mean())
        return float((w * vals).sum() / w.sum())

    st_km  = np.column_stack([
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
        'hour':         target_time.hour,
        'weekday':      target_time.weekday(),
        'month':        target_time.month,
        'sin_hour':     np.sin(2 * np.pi * target_time.hour      / 24),
        'cos_hour':     np.cos(2 * np.pi * target_time.hour      / 24),
        'sin_month':    np.sin(2 * np.pi * target_time.month     / 12),
        'cos_month':    np.cos(2 * np.pi * target_time.month     / 12),
        'sin_weekday':  np.sin(2 * np.pi * target_time.weekday() / 7),
        'cos_weekday':  np.cos(2 * np.pi * target_time.weekday() / 7),
    }
    for h in LAG_HOURS:
        point[f'lag_{h}h'] = _idw_lag(f'lag_{h}h')
    for col in ['rolling_mean_3h', 'rolling_mean_6h', 'rolling_std_6h']:
        point[col] = _idw_lag(col)
    for i in range(2):
        nbr_idx = idxs[min(i, len(idxs) - 1)]
        point[f'neighbor{i+1}_lag_1h']  = float(st['lag_1h'].iloc[nbr_idx])
        point[f'neighbor{i+1}_lag_24h'] = float(st['lag_24h'].iloc[nbr_idx])

    return st, point


def _predict_all_methods(
    target_lat: float,
    target_lon: float,
    target_time: pd.Timestamp,
    train_data: pd.DataFrame,
    model: XGBRegressor,
) -> Optional[dict]:
    """
    Returns predictions for all three methods, or None if not computable.
    """
    st, point = _build_station_df(target_lat, target_lon, target_time, train_data)
    if st is None:
        return None

    point_row = pd.DataFrame([point])[FEATURE_COLS]
    pm25_xgb  = float(model.predict(point_row)[0])

    # Station residuals
    st['pm25_xgb'] = model.predict(st[FEATURE_COLS])
    st['residual'] = st['pm25'] - st['pm25_xgb']

    corr_idw     = _idw_correction(target_lat, target_lon, st)
    corr_kriging = _kriging_correction(target_lat, target_lon, st)

    return {
        'xgb_only':    max(0.0, pm25_xgb),
        'xgb_idw':     max(0.0, pm25_xgb + corr_idw),
        'xgb_kriging': max(0.0, pm25_xgb + corr_kriging),
    }


def _metrics(y_true: np.ndarray, y_pred: np.ndarray, threshold: float) -> dict:
    mae  = float(np.mean(np.abs(y_pred - y_true)))
    rmse = float(np.sqrt(np.mean((y_pred - y_true) ** 2)))
    bias = float(np.mean(y_pred - y_true))
    ss_res = np.sum((y_pred - y_true) ** 2)
    ss_tot = np.sum((y_true - y_true.mean()) ** 2)
    r2   = float(1 - ss_res / ss_tot) if ss_tot > 0 else np.nan
    high_true = y_true >= threshold
    if high_true.sum() == 0:
        recall = np.nan
    else:
        recall = float((y_pred[high_true] >= threshold).mean())
    return {'mae': mae, 'rmse': rmse, 'bias': bias, 'r2': r2, 'high_recall': recall}


def run_comparison(
    station_df: pd.DataFrame,
    model: XGBRegressor,
    time_range=None,
    max_hours: int = 300,
    high_threshold: float = 35.0,
) -> pd.DataFrame:
    """
    Run LOO comparison of all three methods.

    Returns a DataFrame with one row per method, aggregated across all stations.
    """
    if time_range is not None:
        station_df = station_df[
            (station_df['monitor_date'] >= time_range[0]) &
            (station_df['monitor_date'] <= time_range[1])
        ]

    all_stations = (
        station_df.groupby('station_id')[['station_name', 'latitude', 'longitude']]
        .first()
        .reset_index()
    )

    methods = ['xgb_only', 'xgb_idw', 'xgb_kriging']
    station_preds: dict = {m: {'y_true': [], 'y_pred': []} for m in methods}

    for _, held_row in all_stations.iterrows():
        sid   = held_row['station_id']
        sname = held_row['station_name']
        slat  = held_row['latitude']
        slon  = held_row['longitude']

        held_data  = station_df[station_df['station_id'] == sid]
        train_data = station_df[station_df['station_id'] != sid]

        times = held_data['monitor_date'].sort_values().unique()
        if len(times) > max_hours:
            rng   = np.random.default_rng(42)
            times = rng.choice(times, size=max_hours, replace=False)

        n_before = len(station_preds['xgb_only']['y_true'])
        for t in times:
            actual = held_data[held_data['monitor_date'] == t]['pm25'].values
            if len(actual) == 0 or np.isnan(actual[0]):
                continue
            preds = _predict_all_methods(slat, slon, pd.Timestamp(t), train_data, model)
            if preds is None:
                continue
            for m in methods:
                station_preds[m]['y_true'].append(actual[0])
                station_preds[m]['y_pred'].append(preds[m])

        n_this = len(station_preds['xgb_only']['y_true']) - n_before
        print(f"  {sname:20s}  samples={n_this}")

    rows = []
    for m in methods:
        yt = np.array(station_preds[m]['y_true'])
        yp = np.array(station_preds[m]['y_pred'])
        if len(yt) == 0:
            continue
        mvals = _metrics(yt, yp, high_threshold)
        rows.append({'method': m, **{k: round(v, 3) for k, v in mvals.items()},
                     'n_samples': len(yt)})

    return pd.DataFrame(rows)


def main():
    parser = argparse.ArgumentParser(description='Compare spatial correction methods via LOO')
    parser.add_argument('--time-range', nargs=2, metavar=('START', 'END'))
    parser.add_argument('--max-hours', type=int, default=300)
    parser.add_argument('--threshold', type=float, default=35.0,
                        help='High-pollution threshold in ug/m3 (default 35)')
    parser.add_argument('--output', default=None)
    args = parser.parse_args()

    time_range = None
    if args.time_range:
        time_range = (pd.Timestamp(args.time_range[0]),
                      pd.Timestamp(args.time_range[1]))

    print("Loading data and model...")
    station_df = load_station_data()
    model      = load_model()

    print(f"\nComparing spatial methods (LOO, high threshold={args.threshold} ug/m3)...\n")
    report = run_comparison(
        station_df, model,
        time_range=time_range,
        max_hours=args.max_hours,
        high_threshold=args.threshold,
    )

    if report.empty:
        print("No results.")
        return

    print("\n--- Method Comparison ---")
    print(report.to_string(index=False))

    out_path = Path(args.output) if args.output else EXPORTS_DIR / 'method_comparison.csv'
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report.to_csv(out_path, index=False)
    print(f"\nSaved -> {out_path}")

    best = report.loc[report['mae'].idxmin(), 'method']
    print(f"\nBest method by LOO MAE: {best}")
    if best != 'xgb_kriging':
        print("  -> Consider switching the default spatial correction method.")
    else:
        print("  -> Current Kriging correction is confirmed as best.")


if __name__ == '__main__':
    main()
