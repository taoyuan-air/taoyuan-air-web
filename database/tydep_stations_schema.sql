-- TYDEP（原 TEPA）測站資料庫架構

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

CREATE TABLE IF NOT EXISTS tydep_stations (
    station_id   VARCHAR(20)      PRIMARY KEY,
    station_name VARCHAR(100)     NOT NULL,
    county       VARCHAR(50)      NOT NULL DEFAULT '桃園市',
    location     GEOMETRY(Point, 4326),
    latitude     DECIMAL(10, 8),
    longitude    DECIMAL(11, 8),
    address      TEXT,
    is_active    BOOLEAN          DEFAULT true,
    created_at   TIMESTAMP        DEFAULT NOW(),
    updated_at   TIMESTAMP        DEFAULT NOW()
);

INSERT INTO tydep_stations
    (station_id, station_name, county, latitude, longitude, address)
VALUES
    ('0604616A0002', '新興國小', '桃園市', 25.0083, 121.2650, '蘆竹區'),
    ('0604316A0003', '內壢',     '桃園市', 24.9677, 121.2590, '中壢區'),
    ('0604816I0005', '華亞',     '桃園市', 25.0505, 121.3713, '龜山區'),
    ('0605316I0004', '觀音_S',   '桃園市', 25.0525, 121.1181, '觀音區')
ON CONFLICT (station_id) DO UPDATE SET
    station_name = EXCLUDED.station_name,
    latitude     = EXCLUDED.latitude,
    longitude    = EXCLUDED.longitude,
    updated_at   = NOW();

CREATE TABLE IF NOT EXISTS tydep_pollutants (
    pollutant_id       VARCHAR(10)  PRIMARY KEY,
    pollutant_name     VARCHAR(50)  NOT NULL,
    pollutant_eng_name VARCHAR(50)  NOT NULL,
    unit               VARCHAR(20)  NOT NULL,
    aggregation_type   VARCHAR(20)  NOT NULL DEFAULT '1hr_mean',
    description        TEXT,
    created_at         TIMESTAMP    DEFAULT NOW()
);

INSERT INTO tydep_pollutants
    (pollutant_id, pollutant_name, pollutant_eng_name, unit, aggregation_type, description)
VALUES
    ('1',  '二氧化硫',   'SO2',   'ppb',   '1hr_mean', NULL),
    ('2',  '一氧化碳',   'CO',    'ppm',   '1hr_mean', NULL),
    ('3',  '臭氧',       'O3',    'ppb',   '1hr_mean', NULL),
    ('7',  '二氧化氮',   'NO2',   'ppb',   '1hr_mean', NULL),
    ('4',  '懸浮微粒',   'PM10',  'ug/m3', '1hr_mean', NULL),
    ('33', '細懸浮微粒', 'PM2.5', 'ug/m3', '1hr_mean', NULL)
ON CONFLICT (pollutant_id) DO UPDATE SET
    pollutant_name     = EXCLUDED.pollutant_name,
    pollutant_eng_name = EXCLUDED.pollutant_eng_name,
    unit               = EXCLUDED.unit;

CREATE TABLE IF NOT EXISTS tydep_hourly_data (
    id                   BIGSERIAL,
    station_id           VARCHAR(20)    NOT NULL,
    monitor_date         TIMESTAMP      NOT NULL,
    pollutant_id         VARCHAR(10)    NOT NULL,
    pollutant_name       VARCHAR(50)    NOT NULL,
    pollutant_eng_name   VARCHAR(50)    NOT NULL,
    unit                 VARCHAR(20)    NOT NULL,
    concentration        VARCHAR(20),
    concentration_numeric DECIMAL(10, 4),
    data_quality         VARCHAR(10)    DEFAULT 'good',
    period_start           TIMESTAMP,
    period_end             TIMESTAMP,
    source               VARCHAR(20)    DEFAULT 'history',
    created_at           TIMESTAMP      DEFAULT NOW(),
    PRIMARY KEY (id, monitor_date),
    FOREIGN KEY (station_id)   REFERENCES tydep_stations(station_id),
    FOREIGN KEY (pollutant_id) REFERENCES tydep_pollutants(pollutant_id),
    UNIQUE (station_id, monitor_date, pollutant_id)
) PARTITION BY RANGE (monitor_date);

-- ========================================================
-- 4. 建立完整分區表（2019-2026年，按月份）
-- ========================================================

-- 2019 年分區（從 03 月開始）
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2019_03 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2019-03-01') TO ('2019-04-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2019_04 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2019-04-01') TO ('2019-05-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2019_05 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2019-05-01') TO ('2019-06-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2019_06 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2019-06-01') TO ('2019-07-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2019_07 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2019-07-01') TO ('2019-08-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2019_08 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2019-08-01') TO ('2019-09-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2019_09 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2019-09-01') TO ('2019-10-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2019_10 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2019-10-01') TO ('2019-11-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2019_11 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2019-11-01') TO ('2019-12-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2019_12 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2019-12-01') TO ('2020-01-01');

-- 2020 年分區
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2020_01 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2020-01-01') TO ('2020-02-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2020_02 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2020-02-01') TO ('2020-03-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2020_03 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2020-03-01') TO ('2020-04-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2020_04 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2020-04-01') TO ('2020-05-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2020_05 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2020-05-01') TO ('2020-06-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2020_06 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2020-06-01') TO ('2020-07-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2020_07 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2020-07-01') TO ('2020-08-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2020_08 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2020-08-01') TO ('2020-09-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2020_09 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2020-09-01') TO ('2020-10-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2020_10 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2020-10-01') TO ('2020-11-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2020_11 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2020-11-01') TO ('2020-12-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2020_12 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2020-12-01') TO ('2021-01-01');

-- 2021 年分區
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2021_01 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2021-01-01') TO ('2021-02-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2021_02 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2021-02-01') TO ('2021-03-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2021_03 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2021-03-01') TO ('2021-04-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2021_04 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2021-04-01') TO ('2021-05-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2021_05 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2021-05-01') TO ('2021-06-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2021_06 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2021-06-01') TO ('2021-07-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2021_07 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2021-07-01') TO ('2021-08-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2021_08 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2021-08-01') TO ('2021-09-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2021_09 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2021-09-01') TO ('2021-10-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2021_10 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2021-10-01') TO ('2021-11-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2021_11 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2021-11-01') TO ('2021-12-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2021_12 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2021-12-01') TO ('2022-01-01');

-- 2022 年分區
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2022_01 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2022-01-01') TO ('2022-02-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2022_02 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2022-02-01') TO ('2022-03-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2022_03 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2022-03-01') TO ('2022-04-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2022_04 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2022-04-01') TO ('2022-05-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2022_05 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2022-05-01') TO ('2022-06-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2022_06 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2022-06-01') TO ('2022-07-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2022_07 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2022-07-01') TO ('2022-08-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2022_08 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2022-08-01') TO ('2022-09-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2022_09 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2022-09-01') TO ('2022-10-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2022_10 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2022-10-01') TO ('2022-11-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2022_11 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2022-11-01') TO ('2022-12-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2022_12 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2022-12-01') TO ('2023-01-01');

-- 2023 年分區
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2023_01 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2023-01-01') TO ('2023-02-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2023_02 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2023-02-01') TO ('2023-03-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2023_03 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2023-03-01') TO ('2023-04-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2023_04 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2023-04-01') TO ('2023-05-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2023_05 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2023-05-01') TO ('2023-06-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2023_06 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2023-06-01') TO ('2023-07-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2023_07 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2023-07-01') TO ('2023-08-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2023_08 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2023-08-01') TO ('2023-09-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2023_09 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2023-09-01') TO ('2023-10-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2023_10 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2023-10-01') TO ('2023-11-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2023_11 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2023-11-01') TO ('2023-12-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2023_12 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2023-12-01') TO ('2024-01-01');

-- 2024 年分區
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2024_01 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2024_02 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2024_03 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2024_04 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2024_05 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2024_06 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2024_07 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2024_08 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2024_09 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2024_10 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2024_11 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2024_12 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- 2025 年分區
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2025_01 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2025_02 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2025_03 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2025_04 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2025_05 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2025_06 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2025_07 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2025_08 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2025_09 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2025_10 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2025_11 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2025_12 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- 2026 年分區
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2026_01 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2026_02 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2026_03 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2026_04 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2026_05 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2026_06 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2026_07 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2026_08 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2026_09 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2026_10 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2026_11 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS tydep_hourly_data_2026_12 PARTITION OF tydep_hourly_data FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE INDEX IF NOT EXISTS idx_tydep_hourly_station      ON tydep_hourly_data(station_id);
CREATE INDEX IF NOT EXISTS idx_tydep_hourly_date         ON tydep_hourly_data(monitor_date);
CREATE INDEX IF NOT EXISTS idx_tydep_hourly_pollutant    ON tydep_hourly_data(pollutant_eng_name);
CREATE INDEX IF NOT EXISTS idx_tydep_hourly_station_date ON tydep_hourly_data(station_id, monitor_date);
CREATE INDEX IF NOT EXISTS idx_tydep_hourly_quality      ON tydep_hourly_data(data_quality);
CREATE INDEX IF NOT EXISTS idx_tydep_stations_location   ON tydep_stations USING GIST(location);

UPDATE tydep_stations
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE location IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE OR REPLACE VIEW tydep_latest_data AS
SELECT
    s.station_id,
    s.station_name,
    s.county,
    h.monitor_date,
    MAX(CASE WHEN h.pollutant_eng_name = 'PM2.5' THEN h.concentration_numeric END) AS pm25,
    MAX(CASE WHEN h.pollutant_eng_name = 'PM10'  THEN h.concentration_numeric END) AS pm10,
    MAX(CASE WHEN h.pollutant_eng_name = 'O3'    THEN h.concentration_numeric END) AS o3,
    MAX(CASE WHEN h.pollutant_eng_name = 'CO'    THEN h.concentration_numeric END) AS co,
    MAX(CASE WHEN h.pollutant_eng_name = 'SO2'   THEN h.concentration_numeric END) AS so2,
    MAX(CASE WHEN h.pollutant_eng_name = 'NO2'   THEN h.concentration_numeric END) AS no2
FROM tydep_stations s
JOIN tydep_hourly_data h ON s.station_id = h.station_id
WHERE h.monitor_date >= NOW() - INTERVAL '24 hours'
GROUP BY s.station_id, s.station_name, s.county, h.monitor_date
ORDER BY h.monitor_date DESC;

CREATE OR REPLACE VIEW tydep_monthly_stats AS
SELECT
    s.station_id,
    s.station_name,
    DATE_TRUNC('month', h.monitor_date)  AS month,
    h.pollutant_eng_name,
    COUNT(*)                             AS record_count,
    AVG(h.concentration_numeric)         AS avg_concentration,
    MIN(h.concentration_numeric)         AS min_concentration,
    MAX(h.concentration_numeric)         AS max_concentration,
    STDDEV(h.concentration_numeric)      AS std_concentration
FROM tydep_stations s
JOIN tydep_hourly_data h ON s.station_id = h.station_id
WHERE h.concentration_numeric IS NOT NULL
GROUP BY s.station_id, s.station_name,
         DATE_TRUNC('month', h.monitor_date), h.pollutant_eng_name
ORDER BY month DESC, s.station_id, h.pollutant_eng_name;

CREATE OR REPLACE FUNCTION check_tydep_data_quality()
RETURNS TABLE(
    station_id         VARCHAR(20),
    station_name       VARCHAR(100),
    total_records      BIGINT,
    valid_records      BIGINT,
    invalid_records    BIGINT,
    data_quality_ratio NUMERIC(5, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.station_id,
        s.station_name,
        COUNT(h.station_id)                                         AS total_records,
        COUNT(CASE WHEN h.data_quality = 'good'    THEN 1 END)      AS valid_records,
        COUNT(CASE WHEN h.data_quality = 'invalid' THEN 1 END)      AS invalid_records,
        ROUND(
            CASE
                WHEN COUNT(h.station_id) = 0 THEN 0
                ELSE COUNT(CASE WHEN h.data_quality = 'good' THEN 1 END)::NUMERIC
                     / NULLIF(COUNT(h.station_id), 0)::NUMERIC * 100
            END, 2
        )                                                            AS data_quality_ratio
    FROM tydep_stations s
    LEFT JOIN tydep_hourly_data h ON s.station_id = h.station_id
    GROUP BY s.station_id, s.station_name
    ORDER BY s.station_id;
END;
$$ LANGUAGE plpgsql;
