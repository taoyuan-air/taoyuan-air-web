"""
Visualize PM2.5 grid interpolation results.

Reads a grid_pm25_*.parquet file produced by ml/impute/predict.py,
draws a filled contour map of PM2.5, and overlays station observations.

Usage:
    cd ml
    python visualize.py --time "2024-06-15 14:00"
    python visualize.py --input ../data/exports/grid_pm25_20240615_1400.parquet

Output:
    data/exports/map_pm25_<timestamp>.png
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import matplotlib
matplotlib.use('Agg')  # non-interactive backend (works without a display)

import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import matplotlib.font_manager as fm
import numpy as np
import pandas as pd
from scipy.interpolate import griddata

from config import EXPORTS_DIR, TAOYUAN_BBOX, GRID_RESOLUTION


def _setup_cjk_font():
    """Pick the first available CJK-compatible font on Windows/Linux."""
    candidates = [
        'Microsoft JhengHei', 'Microsoft YaHei', 'SimHei',
        'Noto Sans CJK TC', 'Noto Sans CJK SC', 'Heiti TC',
    ]
    available = {f.name for f in fm.fontManager.ttflist}
    for name in candidates:
        if name in available:
            plt.rcParams['font.family'] = name
            return
    # fallback: DejaVu Sans (CJK glyphs will be boxes, but no crash)


_setup_cjk_font()


# PM2.5 colour scale (mirrors AQI breakpoints, simplified)
CMAP   = 'RdYlGn_r'
LEVELS = [0, 5, 10, 15, 20, 25, 35, 50, 75, 100]


def _find_grid_file(target: pd.Timestamp) -> Path:
    fname = f"grid_pm25_{target.strftime('%Y%m%d_%H%M')}.parquet"
    path  = EXPORTS_DIR / fname
    if not path.exists():
        raise FileNotFoundError(
            f"Grid file not found: {path}\n"
            f"Run: cd ml && python -m impute.predict --time \"{target}\""
        )
    return path


def _load_stations(target: pd.Timestamp) -> pd.DataFrame:
    """Return station actual values at target_time (may be empty if no data)."""
    parquet = EXPORTS_DIR / 'pm25_hourly.parquet'
    if not parquet.exists():
        return pd.DataFrame()
    df = pd.read_parquet(parquet)
    df['monitor_date'] = pd.to_datetime(df['monitor_date'])
    return df[df['monitor_date'] == target][
        ['station_name', 'latitude', 'longitude', 'pm25']
    ].dropna(subset=['pm25'])


def plot_grid(grid_path: Path, target: pd.Timestamp, out_path: Path) -> None:
    grid = pd.read_parquet(grid_path)
    stations = _load_stations(target)

    # --- reshape to 2-D grid for contourf ---
    lats = np.sort(grid['latitude'].unique())
    lons = np.sort(grid['longitude'].unique())
    lon2d, lat2d = np.meshgrid(lons, lats)

    # Interpolate scattered grid points onto the regular meshgrid
    z = griddata(
        (grid['longitude'].values, grid['latitude'].values),
        grid['pm25_final'].values,
        (lon2d, lat2d),
        method='linear',
    )

    # --- figure layout ---
    fig, ax = plt.subplots(figsize=(9, 8))
    fig.patch.set_facecolor('#f5f5f5')
    ax.set_facecolor('#e8f4f8')

    # filled contour
    cf = ax.contourf(lon2d, lat2d, z,
                     levels=LEVELS,
                     cmap=CMAP,
                     extend='max',
                     alpha=0.85)
    # contour lines
    ax.contour(lon2d, lat2d, z,
               levels=LEVELS,
               colors='white',
               linewidths=0.4,
               alpha=0.5)

    # colourbar
    cbar = fig.colorbar(cf, ax=ax, fraction=0.03, pad=0.02)
    cbar.set_label('PM2.5 (ug/m3)', fontsize=11)

    # --- station overlay ---
    if not stations.empty:
        sc = ax.scatter(
            stations['longitude'], stations['latitude'],
            c=stations['pm25'],
            cmap=CMAP,
            norm=mcolors.BoundaryNorm(LEVELS, matplotlib.colormaps[CMAP].N),
            s=120, edgecolors='black', linewidths=1.2, zorder=5,
            label='Station obs.'
        )
        for _, row in stations.iterrows():
            ax.annotate(
                f"{row['station_name']}\n{row['pm25']:.1f}",
                xy=(row['longitude'], row['latitude']),
                xytext=(4, 4), textcoords='offset points',
                fontsize=7.5, color='black',
                bbox=dict(boxstyle='round,pad=0.2', fc='white', alpha=0.7, ec='none'),
                zorder=6,
            )
        ax.legend(loc='lower right', fontsize=9)

    # --- axes decoration ---
    ax.set_xlim(TAOYUAN_BBOX['lon_min'], TAOYUAN_BBOX['lon_max'])
    ax.set_ylim(TAOYUAN_BBOX['lat_min'], TAOYUAN_BBOX['lat_max'])
    ax.set_xlabel('Longitude', fontsize=10)
    ax.set_ylabel('Latitude', fontsize=10)
    ax.set_title(
        f"Taoyuan PM2.5 Interpolation\n{target.strftime('%Y-%m-%d %H:%M')} (XGBoost + Kriging)",
        fontsize=13, fontweight='bold', pad=12,
    )
    ax.grid(True, linestyle='--', linewidth=0.4, alpha=0.6)
    ax.set_aspect('equal')

    plt.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"Saved map -> {out_path}")


def main():
    parser = argparse.ArgumentParser(description='Visualize PM2.5 grid')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--time',  help='Target datetime, e.g. "2024-06-15 14:00"')
    group.add_argument('--input', help='Path to grid_pm25_*.parquet file')
    args = parser.parse_args()

    if args.input:
        grid_path = Path(args.input)
        # parse timestamp from filename
        stem = grid_path.stem  # grid_pm25_20240615_1400
        parts = stem.split('_')
        target = pd.Timestamp(f"{parts[2]} {parts[3][:2]}:{parts[3][2:]}")
    else:
        target    = pd.Timestamp(args.time)
        grid_path = _find_grid_file(target)

    out_path = EXPORTS_DIR / f"map_pm25_{target.strftime('%Y%m%d_%H%M')}.png"
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    plot_grid(grid_path, target, out_path)


if __name__ == '__main__':
    main()
