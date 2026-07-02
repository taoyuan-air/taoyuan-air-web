from typing import Optional
from pydantic import BaseModel


class StationResponse(BaseModel):
    station: str
    dates: list[str]   # YYYY-MM-DD，降冪排序


class PanelData(BaseModel):
    z: list[list[Optional[float]]]   # z[height_idx][time_idx]，None = 透明
    unit: str
    colorMin: float
    colorMax: float


class PlotDataResponse(BaseModel):
    station: str
    timezone: str
    heightsKm: list[float]   # 升冪，單位公里
    times: list[str]          # ISO-8601 本地時間字串，台灣時間
    panels: dict[str, PanelData]
    warnings: list[str]
