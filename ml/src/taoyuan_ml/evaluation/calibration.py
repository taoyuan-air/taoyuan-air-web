import numpy as np
import pandas as pd

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


def save_calibration(result: dict) -> None:
    from taoyuan_ml.models.artifacts import write_json
    from taoyuan_ml.settings import MODELS_DIR
    # Constant distance/error data has undefined correlation; persist valid JSON.
    result = dict(result)
    if not np.isfinite(result.get('corr', np.nan)):
        result['corr'] = None
    write_json(MODELS_DIR / 'calibration.json', result)
