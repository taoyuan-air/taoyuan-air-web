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

Use the taoyuan-ml entry point; see ml/README.md for commands.
"""

import argparse
import sys
from pathlib import Path
from typing import Optional, Tuple


import numpy as np
import pandas as pd
from xgboost import XGBRegressor

from taoyuan_ml.settings import METRICS_DIR
from taoyuan_ml.spatial.interpolation import _kriging_correction
from taoyuan_ml.features.definitions import FEATURE_COLS
from .calibration import calibrate_confidence_thresholds, save_calibration
from .point_features import _build_station_features
from taoyuan_ml.models.artifacts import load_model as _load_model
from taoyuan_ml.data.datasets import read_dataset as _load_station_data

def load_model():
    return _load_model('pm25', 'pm25')

def load_station_data():
    return _load_station_data('pm25')


_KM_PER_DEG_LAT = 111.0
_KM_PER_DEG_LON = 101.0


def _nearest_station_km(target_lat: float, target_lon: float,
                         other_stations: pd.DataFrame) -> float:
    """Distance in km from (target_lat, target_lon) to nearest station."""
    if other_stations.empty:
        return np.nan
    dlat = (other_stations['latitude'].values  - target_lat)  * _KM_PER_DEG_LAT
    dlon = (other_stations['longitude'].values - target_lon) * _KM_PER_DEG_LON
    return float(np.sqrt(dlat**2 + dlon**2).min())


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

    pm25_kriging = _kriging_correction(target_lat, target_lon, st)

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
    if max_hours < 1:
        raise ValueError('max_hours must be positive.')
    evaluation_data = station_df
    if time_range is not None:
        if time_range[0] > time_range[1]:
            raise ValueError('Time range start must be at or before end.')
        evaluation_data = station_df[
            (station_df['monitor_date'] >= time_range[0]) &
            (station_df['monitor_date'] <= time_range[1])
        ]

    all_stations = (
        evaluation_data.groupby('station_id')[['station_name', 'latitude', 'longitude']]
        .first()
        .reset_index()
    )

    results = []

    for _, held_row in all_stations.iterrows():
        sid   = held_row['station_id']
        sname = held_row['station_name']
        slat  = held_row['latitude']
        slon  = held_row['longitude']

        held_data  = evaluation_data[evaluation_data['station_id'] == sid]
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

    columns = [
        'station_id', 'station_name', 'latitude', 'longitude',
        'mae', 'rmse', 'bias', 'r2', 'sample_count', 'nearest_station_distance',
    ]
    if not results:
        return pd.DataFrame(columns=columns)
    return pd.DataFrame(results, columns=columns).sort_values('mae', ascending=False)


def main():
    parser = argparse.ArgumentParser(description='LOO spatial validation')
    parser.add_argument('--time-range', nargs=2, metavar=('START', 'END'),
                        help='Filter timestamps, e.g. "2024-06-01" "2024-06-30"')
    parser.add_argument('--max-hours', type=int, default=500,
                        help='Max timestamps per station (default 500)')
    parser.add_argument('--output', default=None,
                        help='CSV output path (default: selected run metrics/loo_results.csv)')
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

    out_path = Path(args.output) if args.output else METRICS_DIR / 'loo_results.csv'
    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)
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
            save_calibration(result)
            print('Calibration saved to the run directory; future predictions will load it.')


if __name__ == '__main__':
    try:
        main()
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        print(f"[ERROR] {exc}")
        sys.exit(1)
