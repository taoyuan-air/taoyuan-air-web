PM25_QUERY = """
SELECT
    h.station_id,
    s.station_name,
    'moe' AS source,
    s.latitude,
    s.longitude,
    NULL::numeric AS altitude,
    h.monitor_date,
    h.concentration_numeric AS pm25
FROM moe_hourly_data h
JOIN moe_stations s ON s.station_id = h.station_id
WHERE h.pollutant_eng_name = 'PM2.5'
  AND h.concentration_numeric IS NOT NULL
  AND h.data_quality = 'good'

UNION ALL

SELECT
    h.station_id,
    s.station_name,
    'tydep' AS source,
    s.latitude,
    s.longitude,
    NULL::numeric AS altitude,
    h.monitor_date,
    h.concentration_numeric AS pm25
FROM tydep_hourly_data h
JOIN tydep_stations s ON s.station_id = h.station_id
WHERE h.pollutant_eng_name = 'PM2.5'
  AND h.concentration_numeric IS NOT NULL
  AND h.data_quality = 'good'

ORDER BY monitor_date, station_id
"""


CWA_QUERIES = {
    'temperature': """
        SELECT
            s.station_id,
            s.station_name,
            'cwa' AS source,
            s.latitude,
            s.longitude,
            s.altitude,
            h.monitor_date,
            h.concentration_numeric AS temperature
        FROM cwa_stations s
        JOIN cwa_hourly_data h ON s.station_id = h.station_id
        WHERE h.observation_id = 'TX01'
          AND h.concentration_numeric IS NOT NULL
          AND h.concentration_numeric BETWEEN -30 AND 60
          AND h.data_quality = 'good'
        ORDER BY h.monitor_date, s.station_id
    """,
    'humidity': """
        SELECT
            s.station_id,
            s.station_name,
            'cwa' AS source,
            s.latitude,
            s.longitude,
            s.altitude,
            r.monitor_date,
            r.concentration_numeric AS humidity,
            CASE WHEN COALESCE(p.concentration_numeric, 0) > 0 THEN 1 ELSE 0 END AS is_raining
        FROM cwa_stations s
        JOIN cwa_hourly_data r
          ON r.station_id = s.station_id
         AND r.observation_id = 'RH01'
        LEFT JOIN cwa_hourly_data p
          ON p.station_id = s.station_id
         AND p.monitor_date = r.monitor_date
         AND p.observation_id = 'PP01'
        WHERE r.concentration_numeric IS NOT NULL
          AND r.concentration_numeric BETWEEN 0 AND 100
          AND r.data_quality = 'good'
        ORDER BY r.monitor_date, s.station_id
    """,
    'wind_speed': """
        SELECT
            s.station_id,
            s.station_name,
            'cwa' AS source,
            s.latitude,
            s.longitude,
            s.altitude,
            h.monitor_date,
            h.concentration_numeric AS wind_speed
        FROM cwa_stations s
        JOIN cwa_hourly_data h ON s.station_id = h.station_id
        WHERE h.observation_id = 'WD01'
          AND h.concentration_numeric IS NOT NULL
          AND h.concentration_numeric BETWEEN 0 AND 75
          AND h.data_quality = 'good'
        ORDER BY h.monitor_date, s.station_id
    """,
    'wind_direction': """
        SELECT
            s.station_id,
            s.station_name,
            'cwa' AS source,
            s.latitude,
            s.longitude,
            s.altitude,
            h.monitor_date,
            h.concentration_numeric AS wind_direction,
            SIN(RADIANS(h.concentration_numeric)) AS wind_dir_sin,
            COS(RADIANS(h.concentration_numeric)) AS wind_dir_cos
        FROM cwa_stations s
        JOIN cwa_hourly_data h ON s.station_id = h.station_id
        WHERE h.observation_id = 'WD02'
          AND h.concentration_numeric IS NOT NULL
          AND h.concentration_numeric >= 0
          AND h.concentration_numeric < 360
          AND h.data_quality = 'good'
        ORDER BY h.monitor_date, s.station_id
    """,
    'pressure': """
        SELECT
            s.station_id,
            s.station_name,
            'cwa' AS source,
            s.latitude,
            s.longitude,
            s.altitude,
            h.monitor_date,
            h.concentration_numeric AS pressure
        FROM cwa_stations s
        JOIN cwa_hourly_data h ON s.station_id = h.station_id
        WHERE h.observation_id = 'PS01'
          AND h.concentration_numeric IS NOT NULL
          AND h.concentration_numeric BETWEEN 800 AND 1100
          AND h.data_quality = 'good'
        ORDER BY h.monitor_date, s.station_id
    """,
}


CWA_METEO_WIDE_QUERY = """
SELECT
    s.station_id AS cwa_station_id,
    s.latitude AS cwa_latitude,
    s.longitude AS cwa_longitude,
    h.monitor_date,
    MAX(CASE WHEN h.observation_id = 'TX01' THEN h.concentration_numeric END) AS temperature,
    MAX(CASE WHEN h.observation_id = 'RH01' THEN h.concentration_numeric END) AS humidity,
    MAX(CASE WHEN h.observation_id = 'WD01' THEN h.concentration_numeric END) AS wind_speed,
    MAX(CASE WHEN h.observation_id = 'WD02' THEN h.concentration_numeric END) AS wind_direction,
    MAX(CASE WHEN h.observation_id = 'PS01' THEN h.concentration_numeric END) AS pressure
FROM cwa_stations s
JOIN cwa_hourly_data h ON s.station_id = h.station_id
WHERE h.observation_id IN ('TX01', 'RH01', 'WD01', 'WD02', 'PS01')
  AND h.concentration_numeric IS NOT NULL
  AND h.data_quality = 'good'
GROUP BY s.station_id, s.latitude, s.longitude, h.monitor_date
ORDER BY h.monitor_date, s.station_id
"""


def query_for(variable: str) -> str:
    if variable == 'pm25':
        return PM25_QUERY
    try:
        return CWA_QUERIES[variable]
    except KeyError as exc:
        raise ValueError(f"Unsupported variable: {variable}") from exc
