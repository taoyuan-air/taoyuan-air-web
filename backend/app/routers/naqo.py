import httpx
from fastapi import APIRouter, Query

from ..config import settings
from ..services.naqo_client import (
    NaqoConfigError,
    fetch_cards_by_days,
    fetch_data_types,
    fetch_latest_cards,
)

router = APIRouter(prefix="/naqo", tags=["naqo"])


@router.get("/status")
async def get_status():
    configured = bool(settings.NAQO_SUPABASE_URL and settings.NAQO_SUPABASE_ANON_KEY)
    return {
        "configured": configured,
        "source": "Supabase",
        "table": settings.NAQO_SUPABASE_TABLE,
        "defaultDataType": settings.NAQO_DEFAULT_DATA_TYPE,
    }


@router.get("/types")
async def get_types():
    try:
        values = await fetch_data_types()
        return {"data": values, "count": len(values)}
    except NaqoConfigError as exc:
        return {"data": [], "count": 0, "error": str(exc)}
    except httpx.HTTPError as exc:
        return {"data": [], "count": 0, "error": str(exc)}


@router.get("/latest")
async def get_latest(limit: int = Query(default=20, ge=1, le=100)):
    try:
        data = await fetch_latest_cards(limit)
        latest_at = data[0].get("observedAt") if data else None
        return {"data": data, "count": len(data), "latestAt": latest_at}
    except NaqoConfigError as exc:
        return {"data": [], "count": 0, "error": str(exc), "latestAt": None}
    except httpx.HTTPError as exc:
        return {"data": [], "count": 0, "error": str(exc), "latestAt": None}


@router.get("/data")
async def get_data(
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=1000, ge=1, le=1000),
):
    try:
        data = await fetch_cards_by_days(days=days, limit=limit)
        return {"data": data, "count": len(data)}
    except NaqoConfigError as exc:
        return {"data": [], "count": 0, "error": str(exc)}
    except httpx.HTTPError as exc:
        return {"data": [], "count": 0, "error": str(exc)}
