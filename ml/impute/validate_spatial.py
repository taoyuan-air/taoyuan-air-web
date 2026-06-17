"""
Leave-One-Station-Out (LOO) spatial cross-validation.

Each station is treated in turn as a "held-out unknown location":
  1. Remove it from the Kriging interpolation data
  2. Use the remaining stations to predict PM2.5 at its location
  3. Compare to the actual PM2.5 values

This evaluates the model's ability to estimate PM2.5 in areas without
monitoring stations — a different question from time-series validation.

Note: The XGBoost model is reused as-is (not retrained per LOO fold) because
retraining for every station × timestamp is prohibitively expensive.  The
held-out station's data IS still present in the XGBoost training set, so XGB
errors at that location may be slightly underestimated. The Kriging step is
fully LOO: the held-out station is excluded from residual interpolation.

Usage:
    cd ml
    python -m impute.validate_spatial
    python -m impute.validate_spatial --time-range "2024-06-01" "2024-06-30"
    python -m impute.validate_spatial --output loo_results.csv
    python -m impute.validate_spatial --calibrate   # also recalibrate thresholds
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
from impute.uncertainty import update_thresholds


_KM_PER_DEG_LAT = 111.0
_KM_PER_DEG_LON = 101.0

# Timestamps needed for rolling stats beyond LAG_HOURS (hours 4, 5)
_ROLLING_EXTRA_HOURS = [4, 5]
_ALL_NEEDED_HOURS = sorted(set([0] + LAG_HOURS + _ROLLING_EXTRA_HOURS))


def load_model() -> XGBRegressor:
    path = MODELS_DIR / 'xgb_pm25.json'
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}\nRun ml/impute/train.py first.")
    model = XGBRegressor(**XGB_PARAMS)
    model.load_model(path)
    return model


def load_station_data() -> pd.DataFrame:
    path = EXPORTS_DIR / 'pm25_hourly.parquet'
    if not path.exists():
        raise FileNotFoundError(f"Parquet not found: {path}\nRun ml/export_parquet.py first.")
    df = pd.read_parquet(path)
    df['monitor_date'] = pd.to_datetime(df['monitor_date'])
    return df


def _nearest_station_km(target_lat: float, target_lon: float,
                         other_stations: pd.DataFrame) -> float:
    """Distance in km from (target_lat, target_lon) to nearest station."""
    if other_stations.empty:
        return np.nan
    dlat = (other_stations['latitude'].values  - target_lat)  * _KM_PER_DEG_LAT
    dlon = (other_stations['longitude'].values - target_lon) * _KM_PER_DEG_LON
    return float(np.sqrt(dlat**2 + dlon**2).min())


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
        sub = window[window['monitor_date'] == t][
            ['station_id', 'latitude', 'longitude', 'pm25']
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

    # Neighbor lags among remaining stations
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
        point[f'lag_{h}h'] = _idw(f'lag_{h}h')
    for col in ['rolling_mean_3h', 'rolling_mean_6h', 'rolling_std_6h']:
        point[col] = _idw(col)
    for i in range(2):
        nbr_idx = idxs[min(i, len(idxs) - 1)]
        point[f'neighbor{i+1}_lag_1h']  = float(st['lag_1h'].iloc[nbr_idx])
        point[f'neighbor{i+1}_lag_24h'] = float(st['lag_24h'].iloc[nbr_idx])

    point_row = pd.DataFrame([point])[FEATURE_COLS]
    return st, point_row


def _predict_at_point(
    target_lat: float,
    target_lon: float,
    target_time: pd.Timestamp,
    train_stations: pd.DataFrame,
    model: XGBRegressor,
) -> dict:
    """
    Predict PM2.5 at (target_lat, target_lon) at target_time using remaining
    stations only.

    Returns dict with pm25_xgb, pm25_kriging, pm25_final (NaN on failure).
    """
    st, point_row = _build_station_features(
        target_lat, target_lon, target_time, train_stations
    )
    if st is None:
        return {'pm25_xgb': np.nan, 'pm25_kriging': np.nan, 'pm25_final': np.nan}

    pm25_xgb = float(model.predict(point_row)[0])

    # XGBoost predictions at station locations for residuals
    station_features = st[FEATURE_COLS].copy()
    st['pm25_xgb'] = model.predict(station_features)
    st['residual'] = st['pm25'] - st['pm25_xgb']

    try:
        ok = OrdinaryKriging(
            st['longitude'].values,
            st['latitude'].values,
            st['residual'].values,
            variogram_model='spherical',
            verbose=False,
            enable_plotting=False,
        )
        kriging_correction, _ = ok.execute('points',
                                           np.array([target_lon]),
                                           np.array([target_lat]))
        pm25_kriging = float(kriging_correction[0])
    except Exception:
        pm25_kriging = 0.0

    pm25_final = max(0.0, pm25_xgb + pm25_kriging)
    return {'pm25_xgb': pm25_xgb, 'pm25_kriging': pm25_kriging, 'pm25_final': pm25_final}


def run_loo(
    station_df: pd.DataFrame,
    model: XGBRegressor,
    time_range: Optional[Tuple[pd.Timestamp, pd.Timestamp]] = None,
    max_hours: int = 500,
) -> pd.DataFrame:
    """
    Run Leave-One-Station-Out cross-validation.

    Returns a DataFrame with per-station summary metrics sorted by MAE desc.
    """
    station_df = station_df.copy()
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

    results = []

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

        y_true, y_pred_final = [], []

        for t in times:
            actual = held_data[held_data['monitor_date'] == t]['pm25'].values
            if len(actual) == 0 or np.isnan(actual[0]):
                continue
            pred = _predict_at_point(slat, slon, pd.Timestamp(t), train_data, model)
            if np.isnan(pred['pm25_final']):
                continue
            y_true.append(actual[0])
            y_pred_final.append(pred['pm25_final'])

        if len(y_true) < 5:
            print(f"  [skip] {sname} ({sid}): too few valid samples ({len(y_true)})")
            continue

        y_true  = np.array(y_true)
        y_final = np.array(y_pred_final)

        mae  = float(np.mean(np.abs(y_final - y_true)))
        rmse = float(np.sqrt(np.mean((y_final - y_true) ** 2)))
        bias = float(np.mean(y_final - y_true))
        ss_res = np.sum((y_final - y_true) ** 2)
        ss_tot = np.sum((y_true - y_true.mean()) ** 2)
        r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else np.nan

        other_stations = all_stations[all_stations['station_id'] != sid]
        nearest_km = _nearest_station_km(slat, slon, other_stations)

        results.append({
            'station_id':               sid,
            'station_name':             sname,
            'latitude':                 slat,
            'longitude':                slon,
            'mae':                      round(mae,  3),
            'rmse':                     round(rmse, 3),
            'bias':                     round(bias, 3),
            'r2':                       round(r2,   3),
            'sample_count':             len(y_true),
            'nearest_station_distance': round(nearest_km, 2),
        })
        print(f"  {sname:20s}  MAE={mae:.2f}  RMSE={rmse:.2f}  "
              f"Bias={bias:+.2f}  R2={r2:.3f}  "
              f"nearest={nearest_km:.1f} km  n={len(y_true)}")

    return pd.DataFrame(results).sort_values('mae', ascending=False)


def calibrate_confidence_thresholds(
    loo_report: pd.DataFrame,
    target_high_mae: float = 5.0,
    target_med_mae: float  = 8.0,
) -> dict:
    """
    Step 7: Derive distance-based confidence thresholds from LOO per-station MAE.

    Strategy: find the nearest_station_distance cut-off at which stations
    typically achieve MAE <= target_high_mae (high), <= target_med_mae (medium).

    Parameters
    ----------
    loo_report      : output of run_loo()
    target_high_mae : maximum MAE acceptable for a "high" confidence zone
    target_med_mae  : maximum MAE acceptable for a "medium" confidence zone

    Returns
    -------
    dict with keys: high_dist_km, med_dist_km, corr, recommendation
    """
    if loo_report.empty or 'nearest_station_distance' not in loo_report.columns:
        return {}

    df = loo_report.dropna(subset=['mae', 'nearest_station_distance']).copy()
    corr = float(df[['mae', 'nearest_station_distance']].corr().iloc[0, 1])

    # For each distance threshold candidate, check what fraction of stations
    # within that distance have MAE <= target
    candidates = np.arange(1.0, 20.0, 0.5)

    high_dist = 3.0   # fallback default
    med_dist  = 8.0   # fallback default

    for d in candidates:
        within = df[df['nearest_station_distance'] <= d]
        if len(within) == 0:
            continue
        frac_ok = (within['mae'] <= target_high_mae).mean()
        if frac_ok >= 0.8:   # 80% of stations within d km achieve target MAE
            high_dist = d
            break

    for d in candidates:
        within = df[df['nearest_station_distance'] <= d]
        if len(within) == 0:
            continue
        frac_ok = (within['mae'] <= target_med_mae).mean()
        if frac_ok >= 0.8:
            med_dist = d
            break

    recommendation = (
        f"LOO correlation(MAE, distance) = {corr:.3f}\n"
        f"Suggested high threshold: {high_dist:.1f} km "
        f"(80% of stations within this range achieve MAE <= {target_high_mae})\n"
        f"Suggested medium threshold: {med_dist:.1f} km "
        f"(80% achieve MAE <= {target_med_mae})"
    )

    return {
        'high_dist_km': high_dist,
        'med_dist_km':  med_dist,
        'corr':         corr,
        'recommendation': recommendation,
    }


def main():
    parser = argparse.ArgumentParser(description='LOO spatial validation')
    parser.add_argument('--time-range', nargs=2, metavar=('START', 'END'),
                        help='Filter timestamps, e.g. "2024-06-01" "2024-06-30"')
    parser.add_argument('--max-hours', type=int, default=500,
                        help='Max timestamps per station (default 500)')
    parser.add_argument('--output', default=None,
                        help='CSV output path (default: data/exports/loo_results.csv)')
    parser.add_argument('--calibrate', action='store_true',
                        help='After LOO, calibrate uncertainty thresholds (Step 7)')
    args = parser.parse_args()

    time_range = None
    if args.time_range:
        time_range = (pd.Timestamp(args.time_range[0]),
                      pd.Timestamp(args.time_range[1]))

    print("Loading data and model...")
    station_df = load_station_data()
    model      = load_model()

    print(f"\nRunning Leave-One-Station-Out validation "
          f"({'all time' if time_range is None else f'{time_range[0].date()} to {time_range[1].date()}'})...\n")

    report = run_loo(station_df, model, time_range=time_range, max_hours=args.max_hours)

    if report.empty:
        print("\nNo results — check that station data and model are available.")
        return

    print("\n--- Per-station LOO Summary ---")
    print(report.to_string(index=False))

    out_path = Path(args.output) if args.output else EXPORTS_DIR / 'loo_results.csv'
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report.to_csv(out_path, index=False)
    print(f"\nSaved -> {out_path}")

    # Correlation hint
    corr = report[['mae', 'nearest_station_distance']].corr().iloc[0, 1]
    print(f"\nCorrelation(MAE, nearest_station_distance) = {corr:.3f}")
    if corr > 0.5:
        print("  -> MAE tends to increase with distance; confidence thresholds likely valid.")
    else:
        print("  -> No strong distance-MAE correlation found.")

    # Step 7: optional threshold calibration
    if args.calibrate:
        print("\n--- Step 7: Calibrating confidence thresholds ---")
        result = calibrate_confidence_thresholds(report)
        if result:
            print(result['recommendation'])
            update_thresholds(
                high_dist_km=result['high_dist_km'],
                med_dist_km=result['med_dist_km'],
            )
            print(f"\nThresholds updated in uncertainty.py: "
                  f"high <= {result['high_dist_km']:.1f} km, "
                  f"medium <= {result['med_dist_km']:.1f} km")


if __name__ == '__main__':
    main()
