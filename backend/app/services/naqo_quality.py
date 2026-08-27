from typing import Any, Optional


INVALID_TOKENS = {"", "x", "X", "NA", "N/A", "null", "None", "-", "#", "*", "nan"}
SENTINEL_VALUES = {-999, -9999, -99.9, 999, 9999}

VALID_RANGE = {
    "PM25": (-5, 1000),
    "O3": (-5, 500),
    "CO": (-5, 50),
    "SO2": (-5, 500),
    "NOX": (-5, 1000),
    "CO2": (-5, 5000),
}


def parse_concentration(raw: Any, pollutant_id: str) -> tuple[Optional[float], str]:
    if raw is None:
        return None, "missing"
    if isinstance(raw, str) and raw.strip() in INVALID_TOKENS:
        return None, "invalid"
    try:
        value = float(raw)
    except (ValueError, TypeError):
        return None, "invalid"
    if value in SENTINEL_VALUES:
        return None, "invalid"

    lo, hi = VALID_RANGE.get(pollutant_id, (float("-inf"), float("inf")))
    if not (lo <= value <= hi):
        return value, "invalid"
    return value, "good"
