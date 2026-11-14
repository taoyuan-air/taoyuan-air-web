-- TYDEP（桃園市環保局，原 TEPA）測站資料庫架構
--
-- 新建資料庫：直接執行本檔
-- 既有資料庫（舊的 0604616A0002 編號、tydep_pollutants 表）：先執行 database/migrate_tydep_v2.sql

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ============================================================
-- 1. 測站基本資料
--    station_id 與環保局即時 CSV 檔名一致：TYDEP_<代號>_<YYYYMMDDHH>.csv
-- ============================================================
CREATE TABLE IF NOT EXISTS tydep_stations (
    station_id   VARCHAR(20)      PRIMARY KEY,
    station_name VARCHAR(100)     NOT NULL,
    county       VARCHAR(50)      NOT NULL DEFAULT '桃園市',
    district     VARCHAR(50),
    location     GEOMETRY(Point, 4326),
    latitude     DECIMAL(10, 8),
    longitude    DECIMAL(11, 8),
    station_type VARCHAR(20),                    -- 空品＋氣象 / 氣象
    is_active    BOOLEAN          DEFAULT true,
    created_at   TIMESTAMP        DEFAULT NOW(),
    updated_at   TIMESTAMP        DEFAULT NOW()
);

INSERT INTO tydep_stations
    (station_id, station_name, county, district, latitude, longitude, station_type)
VALUES
    ('TYDEP_Xinxing',     '新興國小',   '桃園市', '蘆竹區', 25.0083, 121.2650, '空品＋氣象'),
    ('TYDEP_Neili',       '內壢',       '桃園市', '中壢區', 24.9677, 121.2590, '空品＋氣象'),
    ('TYDEP_Huaya',       '華亞',       '桃園市', '龜山區', 25.0505, 121.3713, '空品＋氣象'),
    ('TYDEP_Guanyin',     '觀音_N',     '桃園市', '觀音區', 25.0525, 121.1181, '空品＋氣象'),
    ('TYDEP_Caoluo',      '草漯國小',   '桃園市', '觀音區', NULL,    NULL,     '氣象'),
    ('TYDEP_Fulin',       '富林國小',   '桃園市', '觀音區', NULL,    NULL,     '氣象'),
    ('TYDEP_GuanyinWWTP', '觀音污水廠', '桃園市', '觀音區', NULL,    NULL,     '氣象'),
    ('TYDEP_Shulin',      '樹林國小',   '桃園市', '觀音區', NULL,    NULL,     '氣象')
ON CONFLICT (station_id) DO UPDATE SET
    station_name = EXCLUDED.station_name,
    district     = EXCLUDED.district,
    latitude     = COALESCE(EXCLUDED.latitude,  tydep_stations.latitude),
    longitude    = COALESCE(EXCLUDED.longitude, tydep_stations.longitude),
    station_type = EXCLUDED.station_type,
    updated_at   = NOW();

-- ============================================================
-- 2. 量測參數（ID 沿用環境部測項代碼）
-- ============================================================
CREATE TABLE IF NOT EXISTS tydep_parameters (
    parameter_id       VARCHAR(10)  PRIMARY KEY,
    parameter_name     VARCHAR(50)  NOT NULL,
    parameter_eng_name VARCHAR(50)  NOT NULL,
    unit               VARCHAR(20)  NOT NULL,
    aggregation_type   VARCHAR(20)  NOT NULL DEFAULT '1hr_mean',
    description        TEXT,
    created_at         TIMESTAMP    DEFAULT NOW()
);

INSERT INTO tydep_parameters
    (parameter_id, parameter_name, parameter_eng_name, unit, aggregation_type, description)
VALUES
    ('1',  '二氧化硫',         'SO2',        'ppb',   '1hr_mean',        NULL),
    ('2',  '一氧化碳',         'CO',         'ppm',   '1hr_mean',        NULL),
    ('3',  '臭氧',             'O3',         'ppb',   '1hr_mean',        NULL),
    ('4',  '懸浮微粒',         'PM10',       'ug/m3', '1hr_mean',        NULL),
    ('5',  '氮氧化物',         'NOx',        'ppb',   '1hr_mean',        NULL),
    ('6',  '一氧化氮',         'NO',         'ppb',   '1hr_mean',        NULL),
    ('7',  '二氧化氮',         'NO2',        'ppb',   '1hr_mean',        NULL),
    ('8',  '總碳氫化合物',     'THC',        'ppm',   '1hr_mean',        NULL),
    ('9',  '非甲烷碳氫化合物', 'NMHC',       'ppm',   '1hr_mean',        NULL),
    ('10', '風速',             'WIND_SPEED', 'm/s',   '1hr_mean',        NULL),
    ('11', '風向',             'WIND_ANGLE', 'deg',   '1hr_vector_mean', NULL),
    ('14', '溫度',             'AMB_TEMP',   '℃',     '1hr_mean',        NULL),
    ('31', '甲烷',             'CH4',        'ppm',   '1hr_mean',        NULL),
    ('33', '細懸浮微粒',       'PM2.5',      'ug/m3', '1hr_mean',        NULL),
    ('38', '相對濕度',         'RH',         '%',     '1hr_mean',        NULL)
ON CONFLICT (parameter_id) DO UPDATE SET
    parameter_name     = EXCLUDED.parameter_name,
    parameter_eng_name = EXCLUDED.parameter_eng_name,
    unit               = EXCLUDED.unit,
    aggregation_type   = EXCLUDED.aggregation_type,
    description        = EXCLUDED.description;

-- ============================================================
-- 3. 小時值資料（依 monitor_date 月分區）
-- ============================================================
CREATE TABLE IF NOT EXISTS tydep_hourly_data (
    id                    BIGSERIAL,
    station_id            VARCHAR(20)    NOT NULL,
    monitor_date          TIMESTAMP      NOT NULL,
    parameter_id          VARCHAR(10)    NOT NULL,
    parameter_name        VARCHAR(50)    NOT NULL,
    parameter_eng_name    VARCHAR(50)    NOT NULL,
    unit                  VARCHAR(20)    NOT NULL,
    concentration         VARCHAR(20),
    concentration_numeric DECIMAL(10, 4),
    data_quality          VARCHAR(10)    DEFAULT 'good',
    period_start          TIMESTAMP,
    period_end            TIMESTAMP,
    source                VARCHAR(20)    DEFAULT 'history',
    created_at            TIMESTAMP      DEFAULT NOW(),
    PRIMARY KEY (id, monitor_date),
    FOREIGN KEY (station_id)   REFERENCES tydep_stations(station_id),
    FOREIGN KEY (parameter_id) REFERENCES tydep_parameters(parameter_id),
    UNIQUE (station_id, monitor_date, parameter_id)
) PARTITION BY RANGE (monitor_date);

-- 保底分區：避免尚未建立月份分區時，匯入資料直接失敗。
CREATE TABLE IF NOT EXISTS tydep_hourly_data_default
    PARTITION OF tydep_hourly_data DEFAULT;

CREATE INDEX IF NOT EXISTS idx_tydep_hourly_station      ON tydep_hourly_data(station_id);
CREATE INDEX IF NOT EXISTS idx_tydep_hourly_date         ON tydep_hourly_data(monitor_date);
CREATE INDEX IF NOT EXISTS idx_tydep_hourly_parameter    ON tydep_hourly_data(parameter_eng_name);
CREATE INDEX IF NOT EXISTS idx_tydep_hourly_station_date ON tydep_hourly_data(station_id, monitor_date);
CREATE INDEX IF NOT EXISTS idx_tydep_hourly_quality      ON tydep_hourly_data(data_quality);
CREATE INDEX IF NOT EXISTS idx_tydep_stations_location   ON tydep_stations USING GIST(location);

UPDATE tydep_stations
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ============================================================
-- 檢視表與檢查函式
-- ============================================================
DROP VIEW IF EXISTS tydep_latest_data;
CREATE VIEW tydep_latest_data AS
SELECT
    s.station_id,
    s.station_name,
    s.county,
    s.district,
    s.station_type,
    h.monitor_date,
    MAX(CASE WHEN h.parameter_eng_name = 'PM2.5'      THEN h.concentration_numeric END) AS pm25,
    MAX(CASE WHEN h.parameter_eng_name = 'PM10'       THEN h.concentration_numeric END) AS pm10,
    MAX(CASE WHEN h.parameter_eng_name = 'O3'         THEN h.concentration_numeric END) AS o3,
    MAX(CASE WHEN h.parameter_eng_name = 'CO'         THEN h.concentration_numeric END) AS co,
    MAX(CASE WHEN h.parameter_eng_name = 'SO2'        THEN h.concentration_numeric END) AS so2,
    MAX(CASE WHEN h.parameter_eng_name = 'NO2'        THEN h.concentration_numeric END) AS no2,
    MAX(CASE WHEN h.parameter_eng_name = 'WIND_SPEED' THEN h.concentration_numeric END) AS wind_speed,
    MAX(CASE WHEN h.parameter_eng_name = 'WIND_ANGLE' THEN h.concentration_numeric END) AS wind_angle,
    MAX(CASE WHEN h.parameter_eng_name = 'AMB_TEMP'   THEN h.concentration_numeric END) AS amb_temp,
    MAX(CASE WHEN h.parameter_eng_name = 'RH'         THEN h.concentration_numeric END) AS rh
FROM tydep_stations s
JOIN tydep_hourly_data h ON s.station_id = h.station_id
WHERE h.monitor_date >= NOW() - INTERVAL '24 hours'
GROUP BY s.station_id, s.station_name, s.county, s.district, s.station_type, h.monitor_date
ORDER BY h.monitor_date DESC;

DROP VIEW IF EXISTS tydep_monthly_stats;
CREATE VIEW tydep_monthly_stats AS
SELECT
    s.station_id,
    s.station_name,
    DATE_TRUNC('month', h.monitor_date)  AS month,
    h.parameter_eng_name,
    COUNT(*)                             AS record_count,
    AVG(h.concentration_numeric)         AS avg_concentration,
    MIN(h.concentration_numeric)         AS min_concentration,
    MAX(h.concentration_numeric)         AS max_concentration,
    STDDEV(h.concentration_numeric)      AS std_concentration
FROM tydep_stations s
JOIN tydep_hourly_data h ON s.station_id = h.station_id
WHERE h.concentration_numeric IS NOT NULL
GROUP BY s.station_id, s.station_name,
         DATE_TRUNC('month', h.monitor_date), h.parameter_eng_name
ORDER BY month DESC, s.station_id, h.parameter_eng_name;

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
