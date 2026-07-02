from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db

router = APIRouter(prefix="/explorer", tags=["explorer"])


POLLUTANT_LABELS = {
    "PM2.5": "PM2.5",
    "PM25": "PM2.5",
    "PM10": "PM10",
    "O3": "O3",
    "NOX": "NOx",
    "NOx": "NOx",
    "NO2": "NO2",
    "SO2": "SO2",
    "CO": "CO",
}

DISTRICT_BY_STATION_KEYWORD = {
    "桃園": "桃園區",
    "中壢": "中壢區",
    "平鎮": "平鎮區",
    "龍潭": "龍潭區",
    "大園": "大園區",
    "觀音": "觀音區",
    "蘆竹": "蘆竹區",
    "內壢": "中壢區",
    "華亞": "龜山區",
}


def _as_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _district_for(station_name: str, fallback: Optional[str] = None) -> str:
    if fallback:
        return fallback
    for keyword, district in DISTRICT_BY_STATION_KEYWORD.items():
        if keyword in station_name:
            return district
    return "桃園市"


def _history_record(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    value = _as_float(row.get("value"))
    if value is None:
        return None

    observed_at = row["observed_at"]
    pollutant = POLLUTANT_LABELS.get(row["pollutant"], row["pollutant"])
    station_name = row["station_name"]
    source = row["source"]
    district = _district_for(station_name, row.get("district"))

    return {
        "id": f"{source}:{row['station_id']}:{pollutant}:{observed_at.isoformat()}",
        "source": source,
        "station": f"{source} {station_name}",
        "district": district,
        "region": district,
        "pollutant": pollutant,
        "value": round(value, 3),
        "unit": row.get("unit") or "",
        "time": observed_at.strftime("%m/%d %H:%M"),
        "observedAt": observed_at.isoformat(),
        "passed": value >= 0,
        "trend": "歷史資料",
        "version": "資料庫歷史資料",
        "aqi": 0,
    }


async def _table_exists(db: AsyncSession, table_name: str) -> bool:
    result = await db.execute(
        text("SELECT to_regclass(:table_name) IS NOT NULL"),
        {"table_name": f"public.{table_name}"},
    )
    return bool(result.scalar())


async def _get_latest(db: AsyncSession, table_name: str) -> Optional[str]:
    result = await db.execute(text(f"SELECT MAX(monitor_date) FROM {table_name}"))
    val = result.scalar()
    return val.strftime("%Y-%m-%d") if val else None


async def _fetch_air_history(
    db: AsyncSession,
    table_name: str,
    station_table: str,
    source_name: str,
    days: int,
) -> List[Dict[str, Any]]:
    if not await _table_exists(db, table_name):
        return []

    station_extra = ", s.district AS district" if station_table == "tydep_stations" else ", NULL AS district"
    query = text(
        f"""
        SELECT
            :source_name AS source,
            h.station_id,
            s.station_name,
            h.monitor_date AS observed_at,
            h.pollutant_eng_name AS pollutant,
            h.concentration_numeric AS value,
            h.unit
            {station_extra}
        FROM {table_name} h
        JOIN {station_table} s ON s.station_id = h.station_id
        WHERE h.monitor_date >= NOW() - (:days * INTERVAL '1 day')
          AND h.data_quality = 'good'
          AND h.concentration_numeric IS NOT NULL
          AND h.pollutant_eng_name IN ('PM2.5', 'PM25', 'PM10', 'O3', 'NOx', 'NOX', 'NO2', 'SO2', 'CO')
        ORDER BY h.monitor_date DESC
        LIMIT 1200
        """
    )
    result = await db.execute(query, {"source_name": source_name, "days": days})
    records: List[Dict[str, Any]] = []
    for row in result.mappings().all():
        record = _history_record(dict(row))
        if record:
            records.append(record)
    return records


async def _fetch_cwa_history(db: AsyncSession, days: int) -> List[Dict[str, Any]]:
    if not await _table_exists(db, "cwa_hourly_data"):
        return []

    query = text(
        """
        SELECT
            '氣象署' AS source,
            h.station_id,
            s.station_name,
            h.monitor_date AS observed_at,
            '氣溫' AS pollutant,
            h.concentration_numeric AS value,
            '°C' AS unit,
            NULL AS district
        FROM cwa_hourly_data h
        JOIN cwa_stations s ON s.station_id = h.station_id
        WHERE h.monitor_date >= NOW() - (:days * INTERVAL '1 day')
          AND h.data_quality = 'good'
          AND h.concentration_numeric IS NOT NULL
          AND h.observation_id = 'TX01'
        ORDER BY h.monitor_date DESC
        LIMIT 600
        """
    )
    result = await db.execute(query, {"days": days})
    records: List[Dict[str, Any]] = []
    for row in result.mappings().all():
        record = _history_record(dict(row))
        if record:
            records.append(record)
    return records


@router.get("/history")
async def get_history(
    days: int = Query(default=7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    try:
        records = []
        records.extend(await _fetch_air_history(db, "moe_hourly_data", "moe_stations", "環境部", days))
        records.extend(await _fetch_air_history(db, "tydep_hourly_data", "tydep_stations", "桃園市環保局", days))
        records.extend(await _fetch_cwa_history(db, days))

        latest_at: Dict[str, Optional[str]] = {}
        for table, source in [
            ("moe_hourly_data", "環境部"),
            ("tydep_hourly_data", "桃園市環保局"),
            ("cwa_hourly_data", "氣象署"),
        ]:
            if await _table_exists(db, table):
                latest_at[source] = await _get_latest(db, table)

        return {"data": records, "count": len(records), "latestAt": latest_at}
    except SQLAlchemyError as exc:
        return {"data": [], "count": 0, "error": str(exc), "latestAt": {}}
