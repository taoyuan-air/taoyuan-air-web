from datetime import datetime
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx

from ..config import settings
from .naqo_quality import parse_concentration


PARAMETERS = {
    "PM25": {"name": "細懸浮微粒", "display": "PM2.5", "unit": "UGM"},
    "O3": {"name": "臭氧", "display": "O3", "unit": "PPB"},
    "CO": {"name": "一氧化碳", "display": "CO", "unit": "PPM"},
    "SO2": {"name": "二氧化硫", "display": "SO2", "unit": "PPB"},
    "NOX": {"name": "氮氧化物", "display": "NOx", "unit": "PPB"},
    "CO2": {"name": "二氧化碳", "display": "CO2", "unit": "PPM"},
}


class NaqoConfigError(RuntimeError):
    pass


def _supabase_headers() -> dict[str, str]:
    if not settings.NAQO_SUPABASE_URL or not settings.NAQO_SUPABASE_ANON_KEY:
        raise NaqoConfigError("NAQO Supabase URL 或 anon key 尚未設定")
    return {
        "apikey": settings.NAQO_SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {settings.NAQO_SUPABASE_ANON_KEY}",
    }


def _base_url() -> str:
    if not settings.NAQO_SUPABASE_URL:
        raise NaqoConfigError("NAQO Supabase URL 尚未設定")
    return settings.NAQO_SUPABASE_URL.rstrip("/")


def normalize_observed_at(raw: Any) -> Optional[datetime]:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None

    if settings.NAQO_TZ_WORKAROUND:
        return dt.replace(tzinfo=ZoneInfo("Asia/Taipei"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=ZoneInfo("Asia/Taipei"))
    return dt.astimezone(ZoneInfo("Asia/Taipei"))


def _format_time(dt: datetime) -> str:
    return dt.astimezone(ZoneInfo("Asia/Taipei")).strftime("%m/%d %H:%M")


def _aqi_placeholder(value: Optional[float], pollutant_id: str) -> int:
    if value is None:
        return 0
    if pollutant_id == "PM25":
        return min(200, max(0, round(value * 4)))
    if pollutant_id == "O3":
        return min(200, max(0, round(value * 1.2)))
    if pollutant_id == "CO":
        return min(200, max(0, round(value * 10)))
    return min(200, max(0, round(value)))


def row_to_station_cards(row: dict[str, Any]) -> list[dict[str, Any]]:
    observed_at = normalize_observed_at(row.get("observed_at"))
    if not observed_at:
        return []

    data_type = row.get("data_type") or settings.NAQO_DEFAULT_DATA_TYPE
    cards: list[dict[str, Any]] = []
    for pollutant_id, meta in PARAMETERS.items():
        if pollutant_id not in row:
            continue
        value, quality = parse_concentration(row.get(pollutant_id), pollutant_id)
        if quality != "good" or value is None:
            continue
        cards.append({
            "id": f"naqo:{data_type}:{pollutant_id}:{observed_at.isoformat()}",
            "district": "中大空品站",
            "station": "NAQO 中大空品站",
            "time": _format_time(observed_at),
            "observedAt": observed_at.isoformat(),
            "passed": True,
            "parameter": meta["display"],
            "value": round(value, 4),
            "unit": meta["unit"],
            "source": "中大空品站",
            "version": f"Supabase {data_type}",
            "region": "中壢區",
            "trend": "穩定中",
            "aqi": _aqi_placeholder(value, pollutant_id),
        })
    return cards


async def fetch_supabase_rows(params: dict[str, str], prefer_count: bool = False) -> list[dict[str, Any]]:
    headers = _supabase_headers()
    if prefer_count:
        headers["Prefer"] = "count=exact"

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"{_base_url()}/rest/v1/{settings.NAQO_SUPABASE_TABLE}",
            params=params,
            headers=headers,
        )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, list) else []


async def fetch_latest_cards(limit: int = 20) -> list[dict[str, Any]]:
    rows = await fetch_supabase_rows({
        "select": "*",
        "order": "observed_at.desc",
        "limit": str(max(1, min(limit, 100))),
    })
    cards: list[dict[str, Any]] = []
    for row in rows:
        cards.extend(row_to_station_cards(row))
    return cards


async def fetch_cards_by_days(days: int = 7, limit: int = 1000) -> list[dict[str, Any]]:
    rows = await fetch_supabase_rows({
        "select": "*",
        "order": "observed_at.desc",
        "limit": str(max(1, min(limit, 1000))),
    })
    cards: list[dict[str, Any]] = []
    for row in rows:
        cards.extend(row_to_station_cards(row))
    return cards


async def fetch_data_types() -> list[str]:
    rows = await fetch_supabase_rows({
        "select": "data_type",
        "limit": "1000",
    })
    values = {
        str(row["data_type"])
        for row in rows
        if row.get("data_type")
    }
    return sorted(values) or [settings.NAQO_DEFAULT_DATA_TYPE]
