"""
Compare spatial residual-correction methods using LOO cross-validation.

Methods compared:
  xgb_only   : XGBoost trend, no residual correction
  xgb_idw    : XGBoost + IDW residual correction
  xgb_kriging: XGBoost + Ordinary Kriging residual correction (current default)

Evaluation metric: Leave-One-Station-Out MAE / RMSE / Bias / High-pollution recall

Use the taoyuan-ml entry point; see ml/README.md for commands.
"""

import argparse
import sys
from pathlib import Path
from typing import Optional


import numpy as np
import pandas as pd
from xgboost import XGBRegressor

from taoyuan_ml.settings import METRICS_DIR
from .spatial_validation import load_model, load_station_data
from .point_features import _build_station_features
from .metrics import _metrics
from taoyuan_ml.spatial.interpolation import _idw_correction, _kriging_correction
from taoyuan_ml.features.definitions import FEATURE_COLS


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
    st, point_row = _build_station_features(target_lat, target_lon, target_time, train_data)
    if st is None:
        return None

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

    methods = ['xgb_only', 'xgb_idw', 'xgb_kriging']
    station_preds: dict = {m: {'y_true': [], 'y_pred': []} for m in methods}

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

    out_path = Path(args.output) if args.output else METRICS_DIR / 'method_comparison.csv'
    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    report.to_csv(out_path, index=False)
    print(f"\nSaved -> {out_path}")

    best = report.loc[report['mae'].idxmin(), 'method']
    print(f"\nBest method by LOO MAE: {best}")
    if best != 'xgb_kriging':
        print("  -> Consider switching the default spatial correction method.")
    else:
        print("  -> Current Kriging correction is confirmed as best.")


if __name__ == '__main__':
    try:
        main()
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        print(f"[ERROR] {exc}")
        sys.exit(1)
