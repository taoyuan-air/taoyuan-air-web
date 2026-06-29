from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from ..database import get_db
from ..schemas.uav import FlightSummary, ProfileRow

router = APIRouter(prefix="/uav", tags=["uav"])


@router.get("/flights", response_model=list[FlightSummary])
async def list_flights(db: AsyncSession = Depends(get_db)):
    """回傳所有飛行任務清單。"""
    result = await db.execute(
        text(
            "SELECT flight_id, site_name, flight_direction, data_level, "
            "latitude, longitude FROM uav_flights ORDER BY flight_id ASC"
        )
    )
    rows = result.mappings().all()
    return [FlightSummary(**dict(r)) for r in rows]


@router.get("/profile/{flight_id}", response_model=list[ProfileRow])
async def get_profile(flight_id: str, db: AsyncSession = Depends(get_db)):
    """回傳單次飛行任務的垂直剖面資料。"""
    # 先確認 flight_id 存在，避免 SQL injection 也讓錯誤更明確
    check = await db.execute(
        text("SELECT 1 FROM uav_flights WHERE flight_id = :fid"),
        {"fid": flight_id},
    )
    if not check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=f"找不到飛行任務：{flight_id}")

    result = await db.execute(
        text(
            "SELECT * FROM uav_profile WHERE flight_id = :fid ORDER BY agl_m ASC"
        ),
        {"fid": flight_id},
    )
    rows = result.mappings().all()
    # Use by_alias=True so "PM2.5" (quoted column) is serialised with its real name
    return [ProfileRow(**dict(r)).model_dump(by_alias=True) for r in rows]
