"""
Train independent XGBoost models for imputation variables.

Use the taoyuan-ml entry point; see ml/README.md for commands.
"""

import argparse


import pandas as pd
from xgboost import XGBRegressor

from taoyuan_ml.settings import MODELS_DIR, METRICS_DIR, TRAIN_CUTOFF_DATE, VARIABLES, XGB_PARAMS
from .artifacts import model_name, save_model, record_schema
from taoyuan_ml.evaluation.metrics import evaluate
from taoyuan_ml.data.datasets import read_dataset as load_data
from taoyuan_ml.features.pipeline import add_features
from taoyuan_ml.features.definitions import feature_columns


def split(df: pd.DataFrame):
    cutoff = pd.Timestamp(TRAIN_CUTOFF_DATE)
    mask = df['monitor_date'] < cutoff
    return df[mask], df[~mask]


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
    save_model(model, out)
    record_schema(variable, target_col, cols)
    print(f"Model saved {out}")

    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    report = METRICS_DIR / report_name(variable, target_col)
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
