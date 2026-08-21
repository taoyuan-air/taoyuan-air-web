"""
Generate SHAP feature-importance reports for trained imputation models.

Examples:
    cd ml
    python -m impute.shap_report --variable pm25
    python -m impute.shap_report --variable temperature --sample-size 3000
    python -m impute.shap_report --all
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
from xgboost import XGBRegressor

from config import EXPORTS_DIR, MODELS_DIR, TRAIN_CUTOFF_DATE, VARIABLES
from impute.features import add_features, feature_columns
from impute.train import model_name


DEFAULT_SAMPLE_SIZE = 5000


def _targets_for(variable: str) -> list[str]:
    if VARIABLES[variable].get('circular'):
        return ['wind_dir_sin', 'wind_dir_cos']
    return [VARIABLES[variable]['value_col']]


def _load_model(variable: str, target_col: str) -> XGBRegressor:
    path = MODELS_DIR / model_name(variable, target_col)
    if not path.exists():
        raise FileNotFoundError(
            f"Model not found: {path}\n"
            f"Run ml/impute/train.py --variable {variable} before SHAP analysis."
        )
    model = XGBRegressor()
    model.load_model(str(path))
    return model


def _load_feature_matrix(variable: str, target_col: str) -> tuple[pd.DataFrame, pd.Series]:
    config = VARIABLES[variable]
    path = EXPORTS_DIR / config['parquet']
    if not path.exists():
        raise FileNotFoundError(
            f"Parquet not found: {path}\n"
            f"Run ml/export_parquet.py --variable {variable} before SHAP analysis."
        )

    df = pd.read_parquet(path)
    df['monitor_date'] = pd.to_datetime(df['monitor_date'])
    df = add_features(df, variable=variable, target_col=target_col)
    cols = feature_columns(variable=variable, target_col=target_col)
    df = df.dropna(subset=cols + [target_col])

    cutoff = pd.Timestamp(TRAIN_CUTOFF_DATE)
    val_df = df[df['monitor_date'] >= cutoff]
    source_df = val_df if not val_df.empty else df
    return source_df[cols], source_df[target_col]


def _sample_rows(X: pd.DataFrame, y: pd.Series, sample_size: int, random_state: int) -> tuple[pd.DataFrame, pd.Series]:
    if sample_size <= 0 or len(X) <= sample_size:
        return X, y
    sampled = X.sample(n=sample_size, random_state=random_state)
    return sampled, y.loc[sampled.index]


def _as_2d(values) -> np.ndarray:
    arr = np.asarray(values)
    if arr.ndim == 3:
        return arr[:, :, 0]
    return arr


def report_target(
    variable: str,
    target_col: str,
    sample_size: int,
    top_n: int,
    random_state: int,
) -> pd.DataFrame:
    try:
        import shap
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency: shap. Install it with `pip install -r ml/requirements.txt` "
            "before running SHAP analysis."
        ) from exc

    X, y = _load_feature_matrix(variable, target_col)
    X_sample, y_sample = _sample_rows(X, y, sample_size=sample_size, random_state=random_state)
    model = _load_model(variable, target_col)

    print("\n" + "=" * 72)
    print(f"Variable: {variable} | target: {target_col}")
    print(f"SHAP sample rows: {len(X_sample):,}")
    print(f"Target mean: {y_sample.mean():.3f}")

    explainer = shap.TreeExplainer(model)
    shap_values = _as_2d(explainer.shap_values(X_sample))
    mean_abs = np.abs(shap_values).mean(axis=0)
    mean_signed = shap_values.mean(axis=0)

    importance = (
        pd.DataFrame({
            'feature': X_sample.columns,
            'mean_abs_shap': mean_abs,
            'mean_shap': mean_signed,
        })
        .sort_values('mean_abs_shap', ascending=False)
        .reset_index(drop=True)
    )
    importance['rank'] = importance.index + 1
    importance = importance[['rank', 'feature', 'mean_abs_shap', 'mean_shap']]

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    stem = model_name(variable, target_col).replace('.json', '')
    csv_path = MODELS_DIR / f'{stem}_shap_importance.csv'
    txt_path = MODELS_DIR / f'{stem}_shap_report.txt'
    importance.to_csv(csv_path, index=False, encoding='utf-8')

    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(f"variable={variable}\n")
        f.write(f"target={target_col}\n")
        f.write(f"sample_rows={len(X_sample)}\n")
        f.write(f"target_mean={y_sample.mean():.6f}\n")
        f.write("top_features=rank,feature,mean_abs_shap,mean_shap\n")
        for row in importance.head(top_n).itertuples(index=False):
            f.write(
                f"{row.rank},{row.feature},"
                f"{row.mean_abs_shap:.6f},{row.mean_shap:.6f}\n"
            )

    print(f"Top {top_n} SHAP features:")
    for row in importance.head(top_n).itertuples(index=False):
        print(f"  {row.rank:>2}. {row.feature}: mean_abs_shap={row.mean_abs_shap:.6f}")
    print(f"CSV saved: {csv_path}")
    print(f"Report saved: {txt_path}")
    return importance


def report_variable(variable: str, sample_size: int, top_n: int, random_state: int) -> None:
    for target_col in _targets_for(variable):
        report_target(
            variable=variable,
            target_col=target_col,
            sample_size=sample_size,
            top_n=top_n,
            random_state=random_state,
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Generate SHAP reports for imputation models.')
    parser.add_argument('--variable', choices=sorted(VARIABLES), default='pm25')
    parser.add_argument('--all', action='store_true', help='Generate reports for all configured variables.')
    parser.add_argument('--sample-size', type=int, default=DEFAULT_SAMPLE_SIZE, help='Rows sampled from validation data.')
    parser.add_argument('--top-n', type=int, default=20, help='Number of top features printed and written to text report.')
    parser.add_argument('--random-state', type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    variables = list(VARIABLES) if args.all else [args.variable]
    for variable in variables:
        report_variable(
            variable=variable,
            sample_size=args.sample_size,
            top_n=args.top_n,
            random_state=args.random_state,
        )


if __name__ == '__main__':
    main()
