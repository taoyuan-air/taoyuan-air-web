"""
中央氣象署 (CWA) 天氣資料 API

由前端 shared/src/api/cwa.ts + frontend-web/src/app/api/cwa/route.ts 移植而來。
GET /api/cwa?district=中壢區
回傳格式與原本前端 API 相同：{ "data": CwaWeatherBundle, "isFallback": bool }
"""

import asyncio
import logging
import math
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from ..config import settings
from ..core.ssl_utils import make_gov_ssl_context

router = APIRouter(tags=["cwa"])
logger = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Taipei")
TTL_SECONDS = 60 * 60  # 快取 1 小時
CWA_BASE = "https://opendata.cwa.gov.tw/api/v1/rest/datastore"
HTTP_TIMEOUT = 15.0

# district -> (response, fetched_at)
_cache: Dict[str, Tuple[dict, float]] = {}

# CWA 現況資料以測站為單位，每個行政區對應一個代表測站
CWA_DISTRICT_STATION_MAP: Dict[str, str] = {
    "新屋區": "467050",
    "楊梅區": "C0C660",
    "復興區": "C0C460",
    "觀音區": "C0C740",
    "大園區": "C0C720",
    "大溪區": "C0C630",
    "中壢區": "C0C700",
    "龜山區": "C0C680",
    "龍潭區": "C0C670",
    "平鎮區": "C0C650",
    "蘆竹區": "C0C620",
    "八德區": "C0C490",
}

CWA_STATION_META: Dict[str, Dict[str, str]] = {
    "467050": {"name": "新屋", "type": "署屬有人站"},
    "C1C510": {"name": "水尾", "type": "署屬自動站"},
    "C0C800": {"name": "四稜", "type": "署屬自動站"},
    "C0C790": {"name": "東眼山", "type": "署屬自動站"},
    "C0C750": {"name": "新興坑尾", "type": "署屬自動站"},
    "C0C740": {"name": "觀音工業區", "type": "署屬自動站"},
    "C0C730": {"name": "中大臨海站", "type": "署屬自動站"},
    "C0C720": {"name": "竹圍", "type": "署屬自動站"},
    "C0C710": {"name": "大溪永福", "type": "署屬自動站"},
    "C0C700": {"name": "中壢", "type": "署屬自動站"},
    "C0C680": {"name": "龜山", "type": "署屬自動站"},
    "C0C670": {"name": "龍潭", "type": "署屬自動站"},
    "C0C660": {"name": "楊梅", "type": "署屬自動站"},
    "C0C650": {"name": "平鎮", "type": "署屬自動站"},
    "C0C630": {"name": "大溪", "type": "署屬自動站"},
    "C0C620": {"name": "蘆竹", "type": "署屬自動站"},
    "C0C490": {"name": "八德", "type": "署屬自動站"},
    "C0C460": {"name": "復興", "type": "署屬自動站"},
    "72C440": {"name": "桃園農改場", "type": "農業站"},
    "82C160": {"name": "茶改場", "type": "農業站"},
    "A2C560": {"name": "農工中心", "type": "農業站"},
    "C2C410": {"name": "中央大學", "type": "農業站"},
    "C2C590": {"name": "觀音", "type": "農業站"},
}

DAY_CHARS = ["日", "一", "二", "三", "四", "五", "六"]

# 假資料（API 失敗或未設定金鑰時的 fallback）
MOCK_CURRENT_WEATHER: Dict[str, str] = {
    "temperature": "24",
    "weather": "晴時多雲",
    "humidity": "68",
    "windSpeed": "2.5",
    "dailyHigh": "28",
    "dailyLow": "19",
}

# 多時段取最嚴重天氣描述
WEATHER_SEVERITY: List[Tuple[str, int]] = [
    ("雷雨", 6), ("豪雨", 5), ("大雨", 4),
    ("短暫陣雨或雷雨", 4), ("短暫陣雨", 3), ("陣雨", 3), ("有雨", 3),
    ("陰", 2), ("多雲", 1), ("晴", 0),
]


# ─── 小工具：讓輸出格式與 JavaScript 一致 ─────────────────────────────

def _to_float(val: Any) -> Optional[float]:
    try:
        n = float(val)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(n) else n


def _js_str(n: float) -> str:
    """模仿 JS 的 String(n)：24.0 -> '24'，24.5 -> '24.5'"""
    return str(int(n)) if float(n).is_integer() else str(n)


def _js_round(n: float) -> int:
    """模仿 JS 的 Math.round（.5 一律進位）"""
    return int(math.floor(n + 0.5))


def _date_str(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


def _weekday_char(d: datetime) -> str:
    # Python: 週一=0 … 週日=6；JS getDay(): 週日=0
    return DAY_CHARS[(d.weekday() + 1) % 7]


# ─── 測站挑選 ─────────────────────────────────────────────────────────

def _get_station_id(station: dict) -> Optional[str]:
    st = station.get("Station") or {}
    return (
        station.get("StationId")
        or station.get("StationID")
        or st.get("StationId")
        or st.get("StationID")
    )


def _get_town_name(station: dict) -> Optional[str]:
    return (station.get("GeoInfo") or {}).get("TownName") or (
        station.get("StationPosition") or {}
    ).get("TownName")


def _pick_station(stations: List[dict], district: str) -> Optional[dict]:
    station_id = CWA_DISTRICT_STATION_MAP.get(district)
    if station_id:
        for s in stations:
            if _get_station_id(s) == station_id:
                return s

    keyword = district.replace("區", "")
    for s in stations:
        town = _get_town_name(s)
        if town and keyword in town:
            return s
    return stations[0] if stations else None


def _generate_mock_forecast() -> List[dict]:
    now = datetime.now(TZ)
    days = []
    for i in (1, 2, 3):
        d = now + timedelta(days=i)
        days.append({
            "label": f"{d.month}/{d.day}",
            "dateLabel": f"週{_weekday_char(d)}",
            "maxTemp": str(28 - i),
            "minTemp": str(19 + i),
            "weather": "短暫陣雨" if i == 2 else "晴",
            "precipProb": "60" if i == 2 else "10",
        })
    return days


# ─── 現在天氣觀測 (O-A0001-001) ──────────────────────────────────────

async def _fetch_current_weather(
    client: httpx.AsyncClient, district: str, key: Optional[str]
) -> Tuple[dict, bool]:
    if not key:
        logger.warning("[CWA] API key 未設定，使用假資料")
        return dict(MOCK_CURRENT_WEATHER), True

    try:
        res = await client.get(
            f"{CWA_BASE}/O-A0001-001",
            params={"Authorization": key, "CountyName": "桃園市", "format": "JSON"},
        )
        if res.status_code != 200:
            logger.warning("[CWA] 現況 API 錯誤 HTTP %s", res.status_code)
            return dict(MOCK_CURRENT_WEATHER), True

        stations = (res.json().get("records") or {}).get("Station") or []
        if not stations:
            return dict(MOCK_CURRENT_WEATHER), True

        st = _pick_station(stations, district)
        if not st:
            return dict(MOCK_CURRENT_WEATHER), True
        obs = st.get("WeatherElement") or {}

        def parse_num(val: Any, fallback: str, round_: bool = False) -> str:
            n = _to_float(val)
            if n is None or n <= -90:  # -99 代表該測站無有效資料
                return fallback
            return str(_js_round(n)) if round_ else _js_str(n)

        daily = obs.get("DailyExtreme") or {}
        high = ((daily.get("DailyHigh") or {}).get("TemperatureInfo") or {}).get("AirTemperature")
        low = ((daily.get("DailyLow") or {}).get("TemperatureInfo") or {}).get("AirTemperature")

        station_id = _get_station_id(st)
        meta = CWA_STATION_META.get(station_id or "") or {}
        weather = obs.get("Weather")

        data = {
            "stationId": station_id,
            "stationName": meta.get("name") or st.get("StationName"),
            "stationType": meta.get("type"),
            "district": district,
            "temperature": parse_num(obs.get("AirTemperature"), MOCK_CURRENT_WEATHER["temperature"], True),
            "weather": weather if weather and weather != "-99" else MOCK_CURRENT_WEATHER["weather"],
            "humidity": parse_num(obs.get("RelativeHumidity"), MOCK_CURRENT_WEATHER["humidity"]),
            "windSpeed": parse_num(obs.get("WindSpeed"), MOCK_CURRENT_WEATHER["windSpeed"]),
            "dailyHigh": parse_num(high, MOCK_CURRENT_WEATHER["dailyHigh"], True),
            "dailyLow": parse_num(low, MOCK_CURRENT_WEATHER["dailyLow"], True),
        }
        return data, False
    except Exception as err:  # noqa: BLE001
        logger.error("[CWA] 現況資料請求失敗：%s", type(err).__name__)
        return dict(MOCK_CURRENT_WEATHER), True


# ─── 未來 3 天預報 (F-D0047-005) ─────────────────────────────────────

def _pick_day_weather(wx_times: List[dict]) -> str:
    def hour(t: dict) -> int:
        try:
            return int((t.get("StartTime") or "")[11:13])
        except ValueError:
            return -1

    daytime = [t for t in wx_times if 6 <= hour(t) < 21]
    pool = daytime or wx_times

    def wx(t: dict) -> str:
        vals = t.get("ElementValue") or [{}]
        return (vals[0] or {}).get("Weather") or ""

    best = wx(pool[0]) if pool else "晴"
    best = best or "晴"
    best_score = -1
    for t in pool:
        w = wx(t)
        for key, score in WEATHER_SEVERITY:
            if key in w and score > best_score:
                best_score = score
                best = w
    return best


async def _fetch_weather_forecast(
    client: httpx.AsyncClient, district: str, key: Optional[str]
) -> Tuple[List[dict], str]:
    mock = (_generate_mock_forecast(), "10")
    if not key:
        return mock

    try:
        res = await client.get(
            f"{CWA_BASE}/F-D0047-005",
            params={
                "Authorization": key,
                "LocationsName": "桃園市",
                "LocationName": district,
                "format": "JSON",
            },
        )
        if res.status_code != 200:
            logger.warning("[CWA] 預報 API 錯誤 HTTP %s", res.status_code)
            return mock

        locations = ((res.json().get("records") or {}).get("Locations") or [{}])[0].get("Location") or []
        loc = next((l for l in locations if l.get("LocationName") == district), None)
        loc = loc or (locations[0] if locations else None)
        if not loc:
            return mock

        elem_map: Dict[str, List[dict]] = {
            el.get("ElementName"): el.get("Time") or [] for el in (loc.get("WeatherElement") or [])
        }
        temp_times = elem_map.get("溫度", [])
        wx_times = elem_map.get("天氣現象", [])
        pop_times = elem_map.get("3小時降雨機率", [])

        def first_value(t: dict, field: str) -> Any:
            vals = t.get("ElementValue") or [{}]
            return (vals[0] or {}).get(field)

        def day_max_pop(date_str: str) -> Optional[int]:
            vals = []
            for t in pop_times:
                if (t.get("StartTime") or "").startswith(date_str):
                    try:
                        vals.append(int(first_value(t, "ProbabilityOfPrecipitation") or "0"))
                    except ValueError:
                        pass
            return max(vals) if vals else None

        now = datetime.now(TZ)
        today_pop = day_max_pop(_date_str(now))
        today_precip_prob = str(today_pop if today_pop is not None else 10)

        days = []
        for i in (1, 2, 3):
            d = now + timedelta(days=i)
            ds = _date_str(d)

            temps = [
                n for n in (
                    _to_float(first_value(t, "Temperature"))
                    for t in temp_times
                    if (t.get("DataTime") or "").startswith(ds)
                ) if n is not None
            ]
            max_temp = _js_str(max(temps)) if temps else str(28 - i)
            min_temp = _js_str(min(temps)) if temps else str(19 + i)

            pop = day_max_pop(ds)
            precip_prob = str(pop if pop is not None else (60 if i == 2 else 10))

            day_wx = [t for t in wx_times if (t.get("StartTime") or "").startswith(ds)]

            days.append({
                "label": f"{d.month}/{d.day}",
                "dateLabel": f"週{_weekday_char(d)}",
                "maxTemp": max_temp,
                "minTemp": min_temp,
                "weather": _pick_day_weather(day_wx),
                "precipProb": precip_prob,
            })

        return days, today_precip_prob
    except Exception as err:  # noqa: BLE001
        logger.error("[CWA] 預報資料請求失敗：%s", type(err).__name__)
        return mock


# ─── 過去 1 小時雨量 (O-A0002-001) ───────────────────────────────────

async def _fetch_past1hr_rainfall(
    client: httpx.AsyncClient, district: str, key: Optional[str]
) -> str:
    if not key:
        return "0.0"
    try:
        res = await client.get(
            f"{CWA_BASE}/O-A0002-001",
            params={"Authorization": key, "format": "JSON", "RainfallElement": "Past1hr"},
        )
        if res.status_code != 200:
            logger.warning("[CWA] 雨量 API 錯誤 HTTP %s", res.status_code)
            return "0.0"
        stations = (res.json().get("records") or {}).get("Station") or []
        st = _pick_station(stations, district)
        if not st:
            return "0.0"
        value = ((st.get("RainfallElement") or {}).get("Past1hr") or {}).get("Precipitation")
        return str(value) if value is not None else "0.0"
    except Exception as err:  # noqa: BLE001
        logger.error("[CWA] 雨量資料請求失敗：%s", type(err).__name__)
        return "0.0"


# ─── 整合：一次拿齊現況／預報／雨量 ─────────────────────────────────

async def fetch_cwa_weather(district: str, key: Optional[str]) -> dict:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, verify=make_gov_ssl_context()) as client:
        (current, used_fallback), (forecast, today_pop), rain = await asyncio.gather(
            _fetch_current_weather(client, district, key),
            _fetch_weather_forecast(client, district, key),
            _fetch_past1hr_rainfall(client, district, key),
        )
    return {
        "current": current,
        "forecast": forecast,
        "todayPrecipProb": today_pop,
        "past1hrRain": rain,
        "usedFallback": used_fallback,
    }


@router.get("/cwa")
async def get_cwa(district: str = Query("中壢區", max_length=10)):
    now = time.time()
    cached = _cache.get(district)
    if cached and now - cached[1] < TTL_SECONDS:
        return JSONResponse(cached[0], headers={"X-Cache": "HIT"})

    key = settings.CWA_API_KEY
    data = await fetch_cwa_weather(district, key)
    response = {"data": data, "isFallback": data["usedFallback"] or not key}

    # 只快取桃園的已知行政區、且是真實資料，避免快取被灌爆或假資料被留住一小時
    if district in CWA_DISTRICT_STATION_MAP and not response["isFallback"]:
        _cache[district] = (response, now)

    return JSONResponse(response, headers={"X-Cache": "MISS"})