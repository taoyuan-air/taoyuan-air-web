"""
Report raw, feature-engineered, and train/validation shapes for imputation data.

Examples:
    cd ml
    python -m impute.shape_report
    python -m impute.shape_report --variable pm25
    python -m impute.shape_report --all
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd

from config import EXPORTS_DIR, TRAIN_CUTOFF_DATE, VARIABLES
from impute.features import add_features, feature_columns


def _targets_for(variable: str) -> list[str]:
    if VARIABLES[variable].get('circular'):
        return ['wind_dir_sin', 'wind_dir_cos']
    return [VARIABLES[variable]['value_col']]


def report_variable(variable: str) -> None:
    config = VARIABLES[variable]
    path = EXPORTS_DIR / config['parquet']
    print("\n" + "=" * 72)
    print(f"Variable: {variable}")
    print(f"Parquet: {path.name}")

    if not path.exists():
        print(f"[SKIP] Missing parquet: {path}")
        return

    raw = pd.read_parquet(path)
    raw['monitor_date'] = pd.to_datetime(raw['monitor_date'])
    print(f"Raw shape: {raw.shape}")
    print(f"Stations: {raw['station_id'].nunique():,}")
    print(f"Period: {raw['monitor_date'].min()} ~ {raw['monitor_date'].max()}")

    for target_col in _targets_for(variable):
        try:
            featured = add_features(raw.copy(), variable=variable, target_col=target_col)
        except ValueError as exc:
            print(f"Target: {target_col}")
            print(f"  [ERROR] {exc}")
            continue
        cols = feature_columns(variable=variable, target_col=target_col)
        model_df = featured.dropna(subset=cols + [target_col])
        cutoff = pd.Timestamp(TRAIN_CUTOFF_DATE)
        train_df = model_df[model_df['monitor_date'] < cutoff]
        val_df = model_df[model_df['monitor_date'] >= cutoff]

        print(f"Target: {target_col}")
        print(f"  After add_features shape: {featured.shape}")
        print(f"  After feature dropna shape: {model_df.shape}")
        print(f"  Feature count: {len(cols)}")
        print(f"  X_train shape: {train_df[cols].shape}")
        print(f"  y_train shape: {train_df[target_col].shape}")
        print(f"  X_val shape: {val_df[cols].shape}")
        print(f"  y_val shape: {val_df[target_col].shape}")
        print(f"  Features: {', '.join(cols)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Report imputation dataset shapes.')
    parser.add_argument('--variable', choices=sorted(VARIABLES), default='pm25')
    parser.add_argument('--all', action='store_true', help='Report all configured variables.')
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    variables = list(VARIABLES) if args.all else [args.variable]
    for variable in variables:
        report_variable(variable)


if __name__ == '__main__':
    main()
