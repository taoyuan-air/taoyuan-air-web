"""
Visualize PM2.5 grid interpolation results.

Reads a grid_pm25_*.parquet file produced by ml/impute/predict.py and draws:
  - Left panel  : filled contour PM2.5 map with low-confidence hatch overlay
  - Right panel : confidence-level distribution map (high/medium/low)

Usage:
    cd ml
    python visualize.py --time "2024-06-15 14:00"
    python visualize.py --input ../data/exports/grid_pm25_20240615_1400.parquet

Output:
    data/exports/map_pm25_<timestamp>_with_confidence.png
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
import matplotlib.patches as mpatches
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


_setup_cjk_font()


# PM2.5 colour scale (mirrors AQI breakpoints, simplified)
CMAP   = 'RdYlGn_r'
LEVELS = [0, 5, 10, 15, 20, 25, 35, 50, 75, 100]

# Confidence level colours
_CONF_COLORS = {'high': '#2ecc71', 'medium': '#f1c40f', 'low': '#e74c3c'}


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


def _make_meshgrid(grid: pd.DataFrame):
    lats = np.sort(grid['latitude'].unique())
    lons = np.sort(grid['longitude'].unique())
    lon2d, lat2d = np.meshgrid(lons, lats)
    return lon2d, lat2d


def _draw_pm25_panel(ax, grid: pd.DataFrame, stations: pd.DataFrame, target: pd.Timestamp, fig):
    """Left panel: PM2.5 contourf + low-confidence hatch."""
    lon2d, lat2d = _make_meshgrid(grid)

    z = griddata(
        (grid['longitude'].values, grid['latitude'].values),
        grid['pm25_final'].values,
        (lon2d, lat2d),
        method='linear',
    )

    cf = ax.contourf(lon2d, lat2d, z,
                     levels=LEVELS, cmap=CMAP, extend='max', alpha=0.85)
    ax.contour(lon2d, lat2d, z,
               levels=LEVELS, colors='white', linewidths=0.4, alpha=0.5)

    cbar = fig.colorbar(cf, ax=ax, fraction=0.03, pad=0.02)
    cbar.set_label('PM2.5 (ug/m3)', fontsize=10)

    # hatch low-confidence regions
    if 'confidence_level' in grid.columns:
        low_mask = grid['confidence_level'] == 'low'
        if low_mask.any():
            z_low = griddata(
                (grid['longitude'].values, grid['latitude'].values),
                low_mask.astype(float).values,
                (lon2d, lat2d),
                method='nearest',
            )
            ax.contourf(lon2d, lat2d, z_low,
                        levels=[0.5, 1.5],
                        hatches=['///'],
                        colors='none',
                        alpha=0.0)

    if not stations.empty:
        ax.scatter(
            stations['longitude'], stations['latitude'],
            c=stations['pm25'],
            cmap=CMAP,
            norm=mcolors.BoundaryNorm(LEVELS, matplotlib.colormaps[CMAP].N),
            s=120, edgecolors='black', linewidths=1.2, zorder=5,
            label='Station obs.',
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

    ax.set_xlim(TAOYUAN_BBOX['lon_min'], TAOYUAN_BBOX['lon_max'])
    ax.set_ylim(TAOYUAN_BBOX['lat_min'], TAOYUAN_BBOX['lat_max'])
    ax.set_xlabel('Longitude', fontsize=10)
    ax.set_ylabel('Latitude', fontsize=10)
    ax.set_title(
        f"PM2.5 Interpolation\n{target.strftime('%Y-%m-%d %H:%M')} (XGBoost + Kriging)\n"
        "(/// = low confidence)",
        fontsize=11, fontweight='bold', pad=8,
    )
    ax.grid(True, linestyle='--', linewidth=0.4, alpha=0.6)
    ax.set_aspect('equal')


def _draw_confidence_panel(ax, grid: pd.DataFrame, stations: pd.DataFrame):
    """Right panel: confidence level distribution."""
    lon2d, lat2d = _make_meshgrid(grid)

    if 'confidence_level' not in grid.columns:
        ax.text(0.5, 0.5, 'No confidence_level column',
                ha='center', va='center', transform=ax.transAxes)
        return

    # Encode as numeric for griddata
    level_map = {'high': 2.0, 'medium': 1.0, 'low': 0.0}
    z_conf = griddata(
        (grid['longitude'].values, grid['latitude'].values),
        grid['confidence_level'].map(level_map).values,
        (lon2d, lat2d),
        method='nearest',
    )

    cmap_conf = mcolors.ListedColormap([_CONF_COLORS['low'],
                                        _CONF_COLORS['medium'],
                                        _CONF_COLORS['high']])
    norm_conf = mcolors.BoundaryNorm([-0.5, 0.5, 1.5, 2.5], cmap_conf.N)

    ax.pcolormesh(lon2d, lat2d, z_conf, cmap=cmap_conf, norm=norm_conf, alpha=0.85)

    if not stations.empty:
        ax.scatter(
            stations['longitude'], stations['latitude'],
            c='white', s=100, edgecolors='black', linewidths=1.2, zorder=5,
        )

    legend_patches = [
        mpatches.Patch(color=_CONF_COLORS['high'],   label='High'),
        mpatches.Patch(color=_CONF_COLORS['medium'], label='Medium'),
        mpatches.Patch(color=_CONF_COLORS['low'],    label='Low'),
    ]
    ax.legend(handles=legend_patches, loc='lower right', fontsize=9, title='Confidence')

    ax.set_xlim(TAOYUAN_BBOX['lon_min'], TAOYUAN_BBOX['lon_max'])
    ax.set_ylim(TAOYUAN_BBOX['lat_min'], TAOYUAN_BBOX['lat_max'])
    ax.set_xlabel('Longitude', fontsize=10)
    ax.set_ylabel('Latitude', fontsize=10)
    ax.set_title('Confidence Level Distribution', fontsize=11, fontweight='bold', pad=8)
    ax.grid(True, linestyle='--', linewidth=0.4, alpha=0.6)
    ax.set_aspect('equal')


def plot_grid(grid_path: Path, target: pd.Timestamp, out_path: Path) -> None:
    grid     = pd.read_parquet(grid_path)
    stations = _load_stations(target)

    fig, (ax_pm25, ax_conf) = plt.subplots(1, 2, figsize=(16, 7))
    fig.patch.set_facecolor('#f5f5f5')
    for ax in (ax_pm25, ax_conf):
        ax.set_facecolor('#e8f4f8')

    _draw_pm25_panel(ax_pm25, grid, stations, target, fig)
    _draw_confidence_panel(ax_conf, grid, stations)

    fig.suptitle(
        f"Taoyuan PM2.5 Analysis — {target.strftime('%Y-%m-%d %H:%M')}",
        fontsize=14, fontweight='bold', y=1.01,
    )
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
        stem  = grid_path.stem  # grid_pm25_20240615_1400
        parts = stem.split('_')
        target = pd.Timestamp(f"{parts[2]} {parts[3][:2]}:{parts[3][2:]}")
    else:
        target    = pd.Timestamp(args.time)
        grid_path = _find_grid_file(target)

    out_path = EXPORTS_DIR / f"map_pm25_{target.strftime('%Y%m%d_%H%M')}_with_confidence.png"
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    plot_grid(grid_path, target, out_path)


if __name__ == '__main__':
    main()
