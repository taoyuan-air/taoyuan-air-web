from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db


class LatLng(BaseModel):
    latitude: float
    longitude: float


class TEDSPointResponse(BaseModel):
    id: str
    name: Optional[str]
    latLng: LatLng
    heightM: Optional[float] = None
    source: Optional[str] = None

    model_config = {"from_attributes": True}


router = APIRouter(prefix="/teds-points", tags=["teds-points"])


@router.get("", response_model=list[TEDSPointResponse])
async def list_teds_points(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(
            "SELECT station_id, c_no, comp_nam, latitude, longitude, stack_height "
            "FROM teds_latest_data "
            "WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND c_no LIKE 'H%' "
            "ORDER BY station_id ASC"
        )
    )
    rows = result.mappings().all()

    teds_points = []
    for row in rows:
        point_id = row["c_no"] or str(row["station_id"])
        teds_points.append(
            {
                "id": str(point_id),
                "name": row["comp_nam"],
                "latLng": {
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                },
                "heightM": float(row["stack_height"]) if row["stack_height"] is not None else None,
                "source": "工業",
            }
        )

    return teds_points
