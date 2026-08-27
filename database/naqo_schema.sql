-- NAQO 中大空品站資料庫 schema
-- 第一階段前端可直接透過 backend adapter 查 Supabase；本 schema 供第二階段本地 cache/history 使用。

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS naqo_stations (
    station_id   VARCHAR(30) PRIMARY KEY DEFAULT 'NCU_NAQO',
    station_name VARCHAR(100) NOT NULL DEFAULT 'NAQO 中大空品站',
    county       VARCHAR(50) NOT NULL DEFAULT '桃園市',
    district     VARCHAR(50) NOT NULL DEFAULT '中壢區',
    location     GEOMETRY(Point, 4326),
    latitude     NUMERIC(10, 8) DEFAULT 24.967306,
    longitude    NUMERIC(11, 8) DEFAULT 121.185583,
    source_name  VARCHAR(50) NOT NULL DEFAULT 'NAQO',
    is_active    BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO naqo_stations
    (station_id, station_name, county, district, latitude, longitude, source_name, is_active)
VALUES
    ('NCU_NAQO', 'NAQO 中大空品站', '桃園市', '中壢區', 24.967306, 121.185583, 'NAQO', true)
ON CONFLICT (station_id) DO UPDATE SET
    station_name = EXCLUDED.station_name,
    county = EXCLUDED.county,
    district = EXCLUDED.district,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    source_name = EXCLUDED.source_name,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

UPDATE naqo_stations
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE station_id = 'NCU_NAQO';

CREATE TABLE IF NOT EXISTS naqo_pollutants (
    pollutant_id        VARCHAR(20) PRIMARY KEY,
    pollutant_name      VARCHAR(50) NOT NULL,
    pollutant_eng_name  VARCHAR(50) NOT NULL,
    unit                VARCHAR(20),
    description         TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO naqo_pollutants
    (pollutant_id, pollutant_name, pollutant_eng_name, unit, description)
VALUES
    ('PM25', '細懸浮微粒', 'PM2.5', 'UGM', NULL),
    ('O3',   '臭氧',       'O3',    'PPB', NULL),
    ('CO',   '一氧化碳',   'CO',    'PPM', NULL),
    ('SO2',  '二氧化硫',   'SO2',   'PPB', NULL),
    ('NOX',  '氮氧化物',   'NOx',   'PPB', NULL),
    ('CO2',  '二氧化碳',   'CO2',   'PPM', '預留')
ON CONFLICT (pollutant_id) DO UPDATE SET
    pollutant_name = EXCLUDED.pollutant_name,
    pollutant_eng_name = EXCLUDED.pollutant_eng_name,
    unit = EXCLUDED.unit,
    description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS naqo_hourly_data (
    id                    BIGSERIAL PRIMARY KEY,
    station_id            VARCHAR(30) NOT NULL,
    monitor_date          TIMESTAMPTZ NOT NULL,
    data_type             VARCHAR(20) NOT NULL DEFAULT 'min60',
    pollutant_id          VARCHAR(20) NOT NULL,
    pollutant_name        VARCHAR(50),
    pollutant_eng_name    VARCHAR(50) NOT NULL,
    unit                  VARCHAR(20),
    concentration         VARCHAR(30),
    concentration_numeric NUMERIC(12, 4),
    data_quality          VARCHAR(10) NOT NULL DEFAULT 'good',
    source_inserted_at    TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_naqo_hourly_station
        FOREIGN KEY (station_id) REFERENCES naqo_stations(station_id),
    CONSTRAINT fk_naqo_hourly_pollutant
        FOREIGN KEY (pollutant_id) REFERENCES naqo_pollutants(pollutant_id),
    CONSTRAINT uq_naqo_hourly
        UNIQUE (station_id, monitor_date, data_type, pollutant_id),
    CONSTRAINT ck_naqo_quality
        CHECK (data_quality IN ('good', 'invalid', 'missing'))
);

CREATE INDEX IF NOT EXISTS idx_naqo_hourly_station_date
    ON naqo_hourly_data (station_id, monitor_date DESC);

CREATE INDEX IF NOT EXISTS idx_naqo_hourly_pollutant_date
    ON naqo_hourly_data (pollutant_eng_name, monitor_date DESC);

CREATE INDEX IF NOT EXISTS idx_naqo_hourly_type_date
    ON naqo_hourly_data (data_type, monitor_date DESC);

CREATE INDEX IF NOT EXISTS idx_naqo_hourly_source_inserted
    ON naqo_hourly_data (source_inserted_at DESC);

CREATE INDEX IF NOT EXISTS idx_naqo_stations_location
    ON naqo_stations USING GIST(location);

CREATE OR REPLACE VIEW naqo_latest_data AS
WITH latest AS (
    SELECT DISTINCT ON (station_id, data_type)
           station_id, data_type, monitor_date
    FROM naqo_hourly_data
    WHERE data_quality = 'good'
    ORDER BY station_id, data_type, monitor_date DESC
)
SELECT
    s.station_id,
    s.station_name,
    s.county,
    s.district,
    l.data_type,
    l.monitor_date,
    MAX(CASE WHEN h.pollutant_eng_name = 'PM2.5' THEN h.concentration_numeric END) AS pm25,
    MAX(CASE WHEN h.pollutant_eng_name = 'O3'    THEN h.concentration_numeric END) AS o3,
    MAX(CASE WHEN h.pollutant_eng_name = 'CO'    THEN h.concentration_numeric END) AS co,
    MAX(CASE WHEN h.pollutant_eng_name = 'SO2'   THEN h.concentration_numeric END) AS so2,
    MAX(CASE WHEN h.pollutant_eng_name = 'NOx'   THEN h.concentration_numeric END) AS nox,
    MAX(CASE WHEN h.pollutant_eng_name = 'CO2'   THEN h.concentration_numeric END) AS co2
FROM latest l
JOIN naqo_stations s ON s.station_id = l.station_id
JOIN naqo_hourly_data h
       ON h.station_id   = l.station_id
      AND h.data_type    = l.data_type
      AND h.monitor_date = l.monitor_date
GROUP BY s.station_id, s.station_name, s.county, s.district, l.data_type, l.monitor_date;

CREATE OR REPLACE VIEW naqo_recent_data AS
SELECT
    s.station_id,
    s.station_name,
    s.county,
    s.district,
    h.monitor_date,
    h.data_type,
    MAX(CASE WHEN h.pollutant_eng_name = 'PM2.5' THEN h.concentration_numeric END) AS pm25,
    MAX(CASE WHEN h.pollutant_eng_name = 'O3'    THEN h.concentration_numeric END) AS o3,
    MAX(CASE WHEN h.pollutant_eng_name = 'CO'    THEN h.concentration_numeric END) AS co,
    MAX(CASE WHEN h.pollutant_eng_name = 'SO2'   THEN h.concentration_numeric END) AS so2,
    MAX(CASE WHEN h.pollutant_eng_name = 'NOx'   THEN h.concentration_numeric END) AS nox
FROM naqo_stations s
JOIN naqo_hourly_data h ON s.station_id = h.station_id
WHERE h.monitor_date >= NOW() - INTERVAL '24 hours'
  AND h.data_quality = 'good'
GROUP BY s.station_id, s.station_name, s.county, s.district, h.monitor_date, h.data_type
ORDER BY h.monitor_date DESC;

CREATE OR REPLACE FUNCTION check_naqo_data_quality()
RETURNS TABLE (
    pollutant   VARCHAR,
    total       BIGINT,
    good_count  BIGINT,
    invalid_cnt BIGINT,
    good_ratio  NUMERIC
) AS $$
    SELECT
        pollutant_eng_name,
        COUNT(*),
        COUNT(*) FILTER (WHERE data_quality = 'good'),
        COUNT(*) FILTER (WHERE data_quality <> 'good'),
        ROUND(100.0 * COUNT(*) FILTER (WHERE data_quality = 'good') / NULLIF(COUNT(*), 0), 2)
    FROM naqo_hourly_data
    GROUP BY pollutant_eng_name
    ORDER BY pollutant_eng_name;
$$ LANGUAGE sql STABLE;
