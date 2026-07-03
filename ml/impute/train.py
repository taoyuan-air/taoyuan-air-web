"""
Train independent XGBoost models for imputation variables.

Examples:
    python -m impute.train
    python -m impute.train --variable temperature
    python -m impute.train --all
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

from config import EXPORTS_DIR, MODELS_DIR, TRAIN_CUTOFF_DATE, VARIABLES, XGB_PARAMS
from impute.features import add_features, feature_columns


def load_data(variable: str) -> pd.DataFrame:
    path = EXPORTS_DIR / VARIABLES[variable]['parquet']
    if not path.exists():
        raise FileNotFoundError(f"Parquet not found: {path}\nRun ml/export_parquet.py --variable {variable} first.")
    df = pd.read_parquet(path)
    print(f"Loaded {len(df):,} rows from {path.name}")
    return df


def split(df: pd.DataFrame):
    cutoff = pd.Timestamp(TRAIN_CUTOFF_DATE)
    mask = df['monitor_date'] < cutoff
    return df[mask], df[~mask]


def evaluate(model: XGBRegressor, X: pd.DataFrame, y: pd.Series, label: str) -> dict:
    pred = model.predict(X)
    mae = mean_absolute_error(y, pred)
    rmse = np.sqrt(mean_squared_error(y, pred))
    r2 = r2_score(y, pred)
    print(f"  [{label}] MAE={mae:.3f} RMSE={rmse:.3f} R2={r2:.4f}")
    return {'label': label, 'mae': mae, 'rmse': rmse, 'r2': r2, 'n': len(y)}


def model_name(variable: str, target_col: str) -> str:
    if variable == 'wind_direction':
        suffix = 'sin' if target_col.endswith('_sin') else 'cos'
        return f'xgb_wind_dir_{suffix}.json'
    return f'xgb_{variable}.json'


def report_name(variable: str, target_col: str) -> str:
    stem = model_name(variable, target_col).replace('.json', '')
    return f'{stem}_report.txt'


def train_target(variable: str, target_col: str) -> XGBRegressor:
    df = load_data(variable)
    df = add_features(df, variable=variable, target_col=target_col)
    cols = feature_columns(variable=variable, target_col=target_col)
    df = df.dropna(subset=cols + [target_col])

    train_df, val_df = split(df)
    if train_df.empty or val_df.empty:
        raise RuntimeError(f"Train/validation split produced empty data for {variable}:{target_col}")

    print(f"Variable: {variable} | target: {target_col}")
    print(f"Features: {len(cols)}")
    print(f"Train: {len(train_df):,} rows | Val: {len(val_df):,} rows")
    print(f"Train period: {train_df['monitor_date'].min()} ~ {train_df['monitor_date'].max()}")
    print(f"Val period:   {val_df['monitor_date'].min()} ~ {val_df['monitor_date'].max()}")

    X_train = train_df[cols]
    y_train = train_df[target_col]
    X_val = val_df[cols]
    y_val = val_df[target_col]

    print("\nTraining XGBoost...")
    model = XGBRegressor(**XGB_PARAMS, early_stopping_rounds=50)
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=100)
    print(f"Best iteration: {model.best_iteration}")

    print("\nEvaluation:")
    train_metrics = evaluate(model, X_train, y_train, 'train')
    val_metrics = evaluate(model, X_val, y_val, 'val')

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    out = MODELS_DIR / model_name(variable, target_col)
    out.write_bytes(model.get_booster().save_raw(raw_format='json'))
    print(f"Model saved {out}")

    report = MODELS_DIR / report_name(variable, target_col)
    with open(report, 'w', encoding='utf-8') as f:
        f.write(f"variable={variable}\n")
        f.write(f"target={target_col}\n")
        f.write(f"features={','.join(cols)}\n")
        for m in [train_metrics, val_metrics]:
            f.write(
                f"[{m['label']}] n={m['n']:,} "
                f"MAE={m['mae']:.3f} RMSE={m['rmse']:.3f} R2={m['r2']:.4f}\n"
            )
    print(f"Report saved {report}")

    return model


def train(variable: str = 'pm25') -> list[XGBRegressor]:
    if VARIABLES[variable].get('circular'):
        return [
            train_target(variable, 'wind_dir_sin'),
            train_target(variable, 'wind_dir_cos'),
        ]
    return [train_target(variable, VARIABLES[variable]['value_col'])]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train imputation model.")
    parser.add_argument('--variable', choices=sorted(VARIABLES), default='pm25')
    parser.add_argument('--all', action='store_true', help="Train all variables.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    variables = list(VARIABLES) if args.all else [args.variable]
    for variable in variables:
        print("\n" + "=" * 72)
        train(variable)


if __name__ == '__main__':
    main()
