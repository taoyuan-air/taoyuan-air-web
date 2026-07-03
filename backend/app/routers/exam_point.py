from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db


class LatLng(BaseModel):
    latitude: float
    longitude: float


class ExamPointResponse(BaseModel):
    id: str
    name: str
    latLng: LatLng
    source: str
    note: str | None = None


router = APIRouter(prefix="/exam-points", tags=["exam-points"])


@router.get("", response_model=list[ExamPointResponse])
async def list_exam_points(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(
            "SELECT DISTINCT s.source_id, s.ems_no, s.fac_name, s.emi_chimney, s.latitude, s.longitude "
            "FROM exam_sources s "
            "JOIN exam_records r ON r.source_id = s.source_id "
            "WHERE r.item_id = 'HG' "
            "AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL "
            "ORDER BY s.source_id ASC"
        )
    )
    rows = result.mappings().all()

    exam_points: list[dict] = []
    for row in rows:
        point_id = f"{row['ems_no']}-{row['emi_chimney']}"
        exam_points.append(
            {
                "id": point_id,
                "name": row["fac_name"],
                "latLng": {
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                },
                "source": "汞",
                "note": "固定污染源汞及其化合物檢測資料",
            }
        )

    return exam_points
