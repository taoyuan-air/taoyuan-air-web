from typing import Optional
from pydantic import BaseModel


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
    # PostgreSQL lowercases unquoted identifiers, so view columns arrive lowercase
    t:     Optional[float] = None
    rh:    Optional[float] = None
    p:     Optional[float] = None
    ws:    Optional[float] = None
    wd:    Optional[float] = None
    theta: Optional[float] = None
    pm1:   Optional[float] = None
    pm25:  Optional[float] = None
    pm10:  Optional[float] = None
    o3:    Optional[float] = None
    no2:   Optional[float] = None
    so2:   Optional[float] = None
    co:    Optional[float] = None
    co2:   Optional[float] = None

    model_config = {"from_attributes": True}
