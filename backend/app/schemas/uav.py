from typing import Optional
from pydantic import BaseModel, Field


class FlightSummary(BaseModel):
    flight_id: str
    site_name: Optional[str]
    flight_direction: Optional[str]
    data_level: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]

    model_config = {"from_attributes": True}


class ProfileRow(BaseModel):
    flight_id: str
    site_name: Optional[str]
    agl_m: float
    # PostgreSQL lowercases unquoted identifiers, so most columns arrive lowercase.
    # "PM2.5" is quoted in the view so it keeps its exact name (dot included).
    # We expose it as pm2_5 in Python but alias it to "PM2.5" to match the DB column.
    t:     Optional[float] = None
    rh:    Optional[float] = None
    p:     Optional[float] = None
    ws:    Optional[float] = None
    wd:    Optional[float] = None
    theta: Optional[float] = None
    pm1:   Optional[float] = None
    pm2_5: Optional[float] = Field(default=None, alias="PM2.5")
    pm10:  Optional[float] = None
    o3:    Optional[float] = None
    no2:   Optional[float] = None
    so2:   Optional[float] = None
    co:    Optional[float] = None
    co2:   Optional[float] = None

    model_config = {"from_attributes": True, "populate_by_name": True}
