"""
Wind Lidar FastAPI 路由器
直接查詢資料庫 wind_lidar_data（已由 import_wind_lidar.py 匯入）

時間說明：
  import_wind_lidar.py 將 TXT 的 'Date/time' 欄位以 strptime 直接解析
  後存入 DB，沒有做 UTC+8 轉換，因此 measure_time 實際上就是台灣本地時間。
  API 回應中直接格式化為 'YYYY-MM-DD HH:MM' 字串輸出即可。
"""

import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from ..database import get_db
from ..schemas.wind_lidar import PlotDataResponse, PanelData, StationResponse

router = APIRouter(prefix="/wind-lidar", tags=["wind-lidar"])

# ── 面板設定（colorMin / colorMax / unit）────────────────────────────────────
PANEL_CONFIG: dict[str, dict] = {
    "wind_speed":      {"param_id": "hsp",      "unit": "m/s", "colorMin": 0.0,  "colorMax": 30.0},
    "wind_direction":  {"param_id": "wdir",     "unit": "°",   "colorMin": 0.0,  "colorMax": 360.0},
    "turbulence":      {"param_id": "turb",     "unit": "",    "colorMin": 0.0,  "colorMax": 1.0},
    "cnr":             {"param_id": "mean_int", "unit": "",    "colorMin": 0.0,  "colorMax": 10.0},
}

ALL_PANELS = list(PANEL_CONFIG.keys())

# 有效資料篩選：n_samples > 10 且 hsp > 0
# （與原始 TXT 有效資料篩選邏輯一致）
VALID_FILTER_SQL = """
    n.value > 10 AND h.value > 0
"""


# ── 輔助函數 ──────────────────────────────────────────────────────────────────

def _validate_date(date_str: str) -> None:
    """驗證日期格式為 YYYY-MM-DD，不符合則拋出 400。"""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_str):
        raise HTTPException(status_code=400, detail=f"無效日期格式：{date_str}，請使用 YYYY-MM-DD")


def _validate_station(station: str) -> None:
    """驗證 station ID 格式（英數字、底線、連字號），防止路徑穿越攻擊。"""
    if not re.fullmatch(r"[A-Za-z0-9_\-]{1,30}", station):
        raise HTTPException(status_code=400, detail=f"無效測站 ID：{station}")


def _build_2d_grid(
    rows: list[dict],
    heights: list[float],
    times: list[str],
    param_id: str,
) -> list[list[Optional[float]]]:
    """
    將查詢結果轉換為 2D 格線：grid[h_idx][t_idx]
    未出現的格點預設為 None（heatmap 顯示為透明）。
    """
    h_index = {h: i for i, h in enumerate(heights)}
    t_index = {t: i for i, t in enumerate(times)}

    grid: list[list[Optional[float]]] = [
        [None] * len(times) for _ in range(len(heights))
    ]

    for row in rows:
        h_idx = h_index.get(float(row["height_m"]))
        t_idx = t_index.get(row["time_str"])
        if h_idx is not None and t_idx is not None:
            v = row.get(param_id)
            if v is not None:
                grid[h_idx][t_idx] = float(v)

    return grid


# ── 端點：取得可用測站與日期清單 ─────────────────────────────────────────────

@router.get("/stations", response_model=list[StationResponse])
async def list_stations(db: AsyncSession = Depends(get_db)):
    """
    掃描 wind_lidar_data 資料表，回傳所有測站及其有資料的日期清單。
    日期以降冪排序（最新在前）。
    """
    result = await db.execute(
        text("""
            SELECT
                station_id,
                TO_CHAR(DATE(measure_time), 'YYYY-MM-DD') AS date_str
            FROM wind_lidar_data
            WHERE data_quality = 'good'
            GROUP BY station_id, DATE(measure_time)
            ORDER BY station_id ASC, DATE(measure_time) DESC
        """)
    )
    rows = result.mappings().all()

    # 聚合：station_id → [date_str, ...]
    station_dates: dict[str, list[str]] = {}
    for row in rows:
        sid = row["station_id"]
        if sid not in station_dates:
            station_dates[sid] = []
        station_dates[sid].append(row["date_str"])

    return [
        StationResponse(station=sid, dates=dates)
        for sid, dates in station_dates.items()
    ]


# ── 端點：取得指定測站/日期的 plot data ──────────────────────────────────────

@router.get("/plot-data", response_model=PlotDataResponse)
async def get_plot_data(
    station:   str   = Query(..., description="測站 ID，例如 TMA_328"),
    date:      str   = Query(..., description="日期 YYYY-MM-DD（台灣時間）"),
    heightMax: float = Query(default=1.0, description="高度上限（km）"),
    panels:    str   = Query(default="wind_speed,wind_direction,turbulence,cnr",
                             description="要回傳的面板，逗號分隔"),
    db: AsyncSession = Depends(get_db),
):
    """
    回傳指定測站與日期的風光達 heatmap 資料。
    - 有效篩選條件：n_samples > 10 AND hsp > 0
    - heightMax 過濾：只回傳 height_m <= heightMax * 1000 的高度層
    - 面板 z 矩陣格式：z[height_idx][time_idx]，None = 無資料（透明）
    """
    _validate_station(station)
    _validate_date(date)
    parsed_date = datetime.strptime(date, "%Y-%m-%d").date()  # str → date 物件，asyncpg 需要真正的 date 型別

    requested_panels = [p.strip() for p in panels.split(",") if p.strip() in PANEL_CONFIG]
    if not requested_panels:
        requested_panels = ALL_PANELS

    height_max_m = heightMax * 1000.0  # 公里 → 公尺

    # 確認測站存在
    station_check = await db.execute(
        text("SELECT 1 FROM wind_lidar_stations WHERE station_id = :sid"),
        {"sid": station},
    )
    if not station_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=f"找不到測站：{station}")

    # ── 核心查詢：pivot 7 個參數為寬表，同時套用有效性篩選 ────────────────
    # 使用條件式 MAX 進行 pivot，在同一 pass 中完成
    # 有效性篩選在 HAVING 中做：n_samples > 10 AND hsp > 0
    query = text("""
        SELECT
            TO_CHAR(d.measure_time, 'YYYY-MM-DD HH24:MI')  AS time_str,
            d.height_m,
            MAX(CASE WHEN d.parameter_id = 'hsp'       THEN d.value END) AS hsp,
            MAX(CASE WHEN d.parameter_id = 'vsp'       THEN d.value END) AS vsp,
            MAX(CASE WHEN d.parameter_id = 'wdir'      THEN d.value END) AS wdir,
            MAX(CASE WHEN d.parameter_id = 'turb'      THEN d.value END) AS turb,
            MAX(CASE WHEN d.parameter_id = 'min_int'   THEN d.value END) AS min_int,
            MAX(CASE WHEN d.parameter_id = 'mean_int'  THEN d.value END) AS mean_int,
            MAX(CASE WHEN d.parameter_id = 'n_samples' THEN d.value END) AS n_samples
        FROM wind_lidar_data d
        WHERE d.station_id   = :station
          AND DATE(d.measure_time) = CAST(:date AS date)
          AND d.height_m     <= :height_max_m
          AND d.data_quality = 'good'
        GROUP BY d.measure_time, d.height_m
        ORDER BY d.measure_time ASC, d.height_m ASC
    """)

    result = await db.execute(query, {
        "station":      station,
        "date":         parsed_date,
        "height_max_m": height_max_m,
    })
    raw_rows = result.mappings().all()

    if not raw_rows:
        raise HTTPException(
            status_code=404,
            detail=f"找不到 {station} 在 {date} 的資料",
        )

    # ── 有效性篩選：n_samples > 10 AND hsp > 0 ───────────────────────────
    # 篩選後的有效格點才填入值，其他格點保持 None（heatmap 透明）
    valid_rows = []
    for row in raw_rows:
        n = row["n_samples"]
        h = row["hsp"]
        is_valid = (n is not None and float(n) > 10) and (h is not None and float(h) > 0)
        valid_rows.append(dict(row) | {"_is_valid": is_valid})

    # 取出所有唯一時間點和高度層（包含無效格點，以保持完整格線）
    seen_times: dict[str, None] = {}
    seen_heights: dict[float, None] = {}
    for row in valid_rows:
        seen_times[row["time_str"]] = None
        seen_heights[float(row["height_m"])] = None

    times_list   = list(seen_times.keys())    # 已按 measure_time ASC 排序
    heights_list = sorted(seen_heights.keys())

    # 轉換高度為公里
    heights_km = [round(h / 1000.0, 4) for h in heights_list]

    # ── 建立各面板的 2D 格線 ─────────────────────────────────────────────
    h_index = {h: i for i, h in enumerate(heights_list)}
    t_index = {t: i for i, t in enumerate(times_list)}

    panels_data: dict[str, PanelData] = {}

    for panel_key in requested_panels:
        cfg      = PANEL_CONFIG[panel_key]
        param_id = cfg["param_id"]

        grid: list[list[Optional[float]]] = [
            [None] * len(times_list) for _ in range(len(heights_list))
        ]

        for row in valid_rows:
            if not row["_is_valid"]:
                continue   # 無效格點保持 None
            h_idx = h_index.get(float(row["height_m"]))
            t_idx = t_index.get(row["time_str"])
            if h_idx is None or t_idx is None:
                continue
            v = row.get(param_id)
            if v is not None:
                grid[h_idx][t_idx] = float(v)

        panels_data[panel_key] = PanelData(
            z=grid,
            unit=cfg["unit"],
            colorMin=cfg["colorMin"],
            colorMax=cfg["colorMax"],
        )

    return PlotDataResponse(
        station=station,
        timezone="Asia/Taipei",
        heightsKm=heights_km,
        times=times_list,
        panels=panels_data,
        warnings=[],
    )