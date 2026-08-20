"""
Train independent imputation models for each variable.

Examples:
    python -m impute.train
    python -m impute.train --variable temperature
    python -m impute.train --all
    python -m impute.train --model random_forest --all
"""

import argparse
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent))

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

from config import EXPORTS_DIR, MODELS_DIR, RF_PARAMS, TRAIN_CUTOFF_DATE, VARIABLES, XGB_PARAMS
from impute.features import add_features, feature_columns


MODEL_CHOICES = ('xgboost', 'random_forest')


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


def evaluate(model: Any, X: pd.DataFrame, y: pd.Series, label: str) -> dict:
    pred = model.predict(X)
    mae = mean_absolute_error(y, pred)
    rmse = np.sqrt(mean_squared_error(y, pred))
    r2 = r2_score(y, pred)
    print(f"  [{label}] MAE={mae:.3f} RMSE={rmse:.3f} R2={r2:.4f}")
    return {'label': label, 'mae': mae, 'rmse': rmse, 'r2': r2, 'n': len(y)}


def model_prefix(model_type: str) -> str:
    return 'rf' if model_type == 'random_forest' else 'xgb'


def model_extension(model_type: str) -> str:
    return 'joblib' if model_type == 'random_forest' else 'json'


def model_name(variable: str, target_col: str, model_type: str = 'xgboost') -> str:
    prefix = model_prefix(model_type)
    ext = model_extension(model_type)
    if variable == 'wind_direction':
        suffix = 'sin' if target_col.endswith('_sin') else 'cos'
        return f'{prefix}_wind_dir_{suffix}.{ext}'
    return f'{prefix}_{variable}.{ext}'


def report_name(variable: str, target_col: str, model_type: str = 'xgboost') -> str:
    stem = Path(model_name(variable, target_col, model_type)).stem
    return f'{stem}_report.txt'


def build_model(model_type: str) -> Any:
    if model_type == 'random_forest':
        return RandomForestRegressor(**RF_PARAMS)
    return XGBRegressor(**XGB_PARAMS, early_stopping_rounds=50)


def fit_model(
    model: Any,
    model_type: str,
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
) -> None:
    if model_type == 'random_forest':
        model.fit(X_train, y_train)
        return

    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=100)
    print(f"Best iteration: {model.best_iteration}")


def save_model(model: Any, model_type: str, out: Path) -> None:
    if model_type == 'random_forest':
        joblib.dump(model, out)
        return

    out.write_bytes(model.get_booster().save_raw(raw_format='json'))


def model_params(model_type: str) -> dict:
    return RF_PARAMS if model_type == 'random_forest' else XGB_PARAMS


def train_target(variable: str, target_col: str, model_type: str = 'xgboost') -> Any:
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

    print(f"\nTraining {model_type}...")
    model = build_model(model_type)
    fit_model(model, model_type, X_train, y_train, X_val, y_val)

    print("\nEvaluation:")
    train_metrics = evaluate(model, X_train, y_train, 'train')
    val_metrics = evaluate(model, X_val, y_val, 'val')

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    out = MODELS_DIR / model_name(variable, target_col, model_type)
    save_model(model, model_type, out)
    print(f"Model saved {out}")

    report = MODELS_DIR / report_name(variable, target_col, model_type)
    with open(report, 'w', encoding='utf-8') as f:
        f.write(f"model={model_type}\n")
        f.write(f"variable={variable}\n")
        f.write(f"target={target_col}\n")
        f.write(f"params={model_params(model_type)}\n")
        f.write(f"features={','.join(cols)}\n")
        for m in [train_metrics, val_metrics]:
            f.write(
                f"[{m['label']}] n={m['n']:,} "
                f"MAE={m['mae']:.3f} RMSE={m['rmse']:.3f} R2={m['r2']:.4f}\n"
            )
    print(f"Report saved {report}")

    return model


def train(variable: str = 'pm25', model_type: str = 'xgboost') -> list[Any]:
    if VARIABLES[variable].get('circular'):
        return [
            train_target(variable, 'wind_dir_sin', model_type),
            train_target(variable, 'wind_dir_cos', model_type),
        ]
    return [train_target(variable, VARIABLES[variable]['value_col'], model_type)]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train imputation model.")
    parser.add_argument('--variable', choices=sorted(VARIABLES), default='pm25')
    parser.add_argument('--all', action='store_true', help="Train all variables.")
    parser.add_argument(
        '--model',
        choices=MODEL_CHOICES,
        default='xgboost',
        help="Model algorithm to train. Defaults to xgboost for backward compatibility.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    variables = list(VARIABLES) if args.all else [args.variable]
    for variable in variables:
        print("\n" + "=" * 72)
        train(variable, args.model)


if __name__ == '__main__':
    main()
