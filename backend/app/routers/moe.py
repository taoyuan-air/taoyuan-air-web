"""
環境部 (MOE) 空氣品質測站 API

由前端 shared/src/api/moe.ts + frontend-web/src/app/api/moe/route.ts 移植而來。
GET /api/moe
回傳格式與原本前端 API 相同：{ "data": MoeStationData[], "isFallback": bool }
"""

import asyncio
import logging
import math
import time
from typing import Any, List, Optional, Tuple
from urllib.parse import quote, urlencode

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..config import settings

router = APIRouter(tags=["moe"])
logger = logging.getLogger(__name__)

TTL_SECONDS = 60 * 60  # 快取 1 小時
MOE_URL = "https://data.moenv.gov.tw/api/v2/aqx_p_432"
MOE_TARGET_STATIONS = ["中壢", "桃園", "大園", "觀音", "平鎮", "龍潭"]
HTTP_TIMEOUT = 15.0

_cache: Optional[Tuple[dict, float]] = None


def _num(val: Any) -> float:
    """模仿 JS 的 Number(x) || 0；整數就回傳 int，輸出跟原本一樣是 12 而不是 12.0"""
    try:
        n = float(val)
    except (TypeError, ValueError):
        return 0
    if math.isnan(n):
        return 0
    return int(n) if n.is_integer() else n


def parse_moe_records(records: List[dict]) -> List[dict]:
    return [
        {
            "sitename": r.get("sitename") or "",
            "aqi": _num(r.get("aqi")),
            "pm25": _num(r.get("pm2.5")),
            "pm10": _num(r.get("pm10")),
            "o3": _num(r.get("o3")),
            "nox": _num(r.get("nox")),
            "so2": _num(r.get("so2")),
            "co": _num(r.get("co")),
            "no2": _num(r.get("no2")),
            "datacreationdate": r.get("publishtime"),
        }
        for r in records
    ]


def _build_url(station: str, key: str) -> str:
    params = urlencode({"format": "json", "offset": "0", "limit": "10", "api_key": key})
    # filters 的逗號要保持原樣，MOE API 不接受 %2C
    return f"{MOE_URL}?{params}&filters=SiteName,EQ,{quote(station)}"


async def _fetch_station(client: httpx.AsyncClient, station: str, key: str) -> List[dict]:
    res = await client.get(_build_url(station, key))
    if res.status_code != 200:
        raise RuntimeError(f"MOE API 錯誤 {res.status_code}")
    try:
        body = res.json()
    except ValueError:
        return []
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        return body.get("records") or []
    return []


async def fetch_moe_stations(key: Optional[str]) -> List[dict]:
    if not key:
        logger.warning("[MOE] API key 未設定，跳過請求")
        return []

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        results = await asyncio.gather(
            *(_fetch_station(client, s, key) for s in MOE_TARGET_STATIONS),
            return_exceptions=True,
        )

    all_records: List[dict] = []
    for station, result in zip(MOE_TARGET_STATIONS, results):
        if isinstance(result, Exception):
            # 只記錄錯誤類型，避免把含金鑰的網址寫進 log
            logger.warning("[MOE] 站點 %s 失敗: %s", station, type(result).__name__)
            continue
        all_records.extend(result)

    return parse_moe_records(all_records)


@router.get("/moe")
async def get_moe():
    global _cache
    now = time.time()
    if _cache and now - _cache[1] < TTL_SECONDS:
        return JSONResponse(_cache[0], headers={"X-Cache": "HIT"})

    key = settings.MOE_API_KEY
    data = await fetch_moe_stations(key)
    response = {"data": data, "isFallback": not key or len(data) == 0}

    # 拿到真實資料才快取，失敗時下次請求會重試
    if not response["isFallback"]:
        _cache = (response, now)

    return JSONResponse(response, headers={"X-Cache": "MISS"})