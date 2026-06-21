-- WindLidar 風光達資料庫架構
-- 分支: feat/database-WindLidar
-- 建立日期: 2026-05-25
-- 儀器: TMA_328（可擴充）
-- 資料範圍: 2026-03-27 至 2026-04-15，共 20 天
-- 量測間隔: 每 10 分鐘，760 高度層（9.1m～984.6m）
-- 時間欄位: 原始 Date/time 視為 UTC，以 TIMESTAMPTZ 儲存；View 另提供台灣時間欄位
-- 資料流程: txt → 直接匯入 DB（資料量過大，不產生 JSON 中間層）

-- 0. 啟用必要擴充功能
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 儀器基本資料表
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wind_lidar_stations (
    station_id  VARCHAR(20)           PRIMARY KEY,
    county      VARCHAR(50)           NOT NULL DEFAULT '桃園市',
    location    GEOMETRY(Point, 4326),
    latitude    DECIMAL(10, 8),
    longitude   DECIMAL(11, 8),
    altitude_m  DECIMAL(7, 1),                    -- 儀器離地高度（公尺）
    is_active   BOOLEAN               DEFAULT true,
    created_at  TIMESTAMP             DEFAULT NOW(),
    updated_at  TIMESTAMP             DEFAULT NOW()
);

ALTER TABLE IF EXISTS wind_lidar_stations
    ADD COLUMN IF NOT EXISTS location GEOMETRY(Point, 4326),
    ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
    ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
    ADD COLUMN IF NOT EXISTS altitude_m DECIMAL(7, 1),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    DROP COLUMN IF EXISTS address;

-- 插入 TMA_328 儀器資料
INSERT INTO wind_lidar_stations
    (station_id, county, location, latitude, longitude, altitude_m)
VALUES
    ('TMA_328', '桃園市', ST_SetSRID(ST_MakePoint(121.11794722, 25.05283056), 4326), 25.05283056, 121.11794722, 36.0)
ON CONFLICT (station_id) DO UPDATE SET
    location   = EXCLUDED.location,
    latitude   = EXCLUDED.latitude,
    longitude  = EXCLUDED.longitude,
    altitude_m = EXCLUDED.altitude_m,
    updated_at = NOW();

-- 空間索引
CREATE INDEX IF NOT EXISTS idx_wl_stations_location
    ON wind_lidar_stations USING GIST(location);

-- 更新 PostGIS location 欄位
UPDATE wind_lidar_stations
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 量測參數種類表
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wind_lidar_parameters (
    parameter_id   VARCHAR(10)  PRIMARY KEY,
    parameter_name VARCHAR(50)  NOT NULL,
    parameter_eng  VARCHAR(50)  NOT NULL,
    unit           VARCHAR(20)  NOT NULL,
    data_type      VARCHAR(10)  NOT NULL DEFAULT 'float',  -- 'float' 或 'integer'
    description    TEXT,
    created_at     TIMESTAMP    DEFAULT NOW()
);

INSERT INTO wind_lidar_parameters
    (parameter_id, parameter_name, parameter_eng, unit, data_type, description)
VALUES
    ('hsp',       '水平風速',     'horizontal speed', 'm/s',    'float',   '水平風速'),
    ('vsp',       '垂直風速',     'vertical speed',   'm/s',    'float',   '正值向上，負值向下'),
    ('wdir',      '風向',         'wind direction',   'degree', 'float',   '範圍 [0, 360)，0/360 為正北，順時針'),
    ('turb',      '亂流強度',     'turbulence',       '無因次', 'float',   '亂流強度'),
    ('min_int',   '最小訊號強度', 'minimum intensity', '',      'float',   '最小訊號強度'),
    ('mean_int',  '平均訊號強度', 'mean intensity',    '',      'float',   '平均訊號強度'),
    ('n_samples', '樣本數',       'number of samples', '',      'integer', '該時間與高度層之統計筆數')
ON CONFLICT (parameter_id) DO UPDATE SET
    parameter_name = EXCLUDED.parameter_name,
    parameter_eng  = EXCLUDED.parameter_eng,
    unit           = EXCLUDED.unit,
    data_type      = EXCLUDED.data_type,
    description    = EXCLUDED.description;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 量測資料表（分區表，按天分區）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wind_lidar_data (
    id           BIGSERIAL,
    station_id   VARCHAR(20)    NOT NULL,
    measure_time TIMESTAMPTZ    NOT NULL,           -- 分區鍵，10分鐘均值的區間終點（UTC）
    height_m     NUMERIC(7, 1)  NOT NULL,           -- 量測高度（公尺）
    parameter_id VARCHAR(10)    NOT NULL,
    value        NUMERIC(10, 3),                    -- 量測數值（無效值為 NULL）
    raw_value    VARCHAR(30),                       -- 原始字串值
    data_quality VARCHAR(10)    DEFAULT 'good',     -- 'good' 或 'invalid'
    period_start TIMESTAMPTZ,                       -- measure_time - 10 分鐘（UTC）
    period_end   TIMESTAMPTZ,                       -- 等同 measure_time（UTC）
    source       VARCHAR(20)    DEFAULT 'history',
    created_at   TIMESTAMP      DEFAULT NOW(),
    PRIMARY KEY (id, measure_time),
    FOREIGN KEY (station_id)   REFERENCES wind_lidar_stations(station_id),
    FOREIGN KEY (parameter_id) REFERENCES wind_lidar_parameters(parameter_id),
    UNIQUE (station_id, measure_time, height_m, parameter_id)
) PARTITION BY RANGE (measure_time);

-- 將舊版 YYYYMMDD 分區名稱正規化為 YYYY_MM_DD，避免相同範圍重複建表。
DO $$
DECLARE
    old_partition RECORD;
    normalized_name TEXT;
BEGIN
    FOR old_partition IN
        SELECT child.relname
        FROM pg_inherits inheritance
        JOIN pg_class parent ON parent.oid = inheritance.inhparent
        JOIN pg_class child ON child.oid = inheritance.inhrelid
        WHERE parent.oid = 'wind_lidar_data'::regclass
          AND child.relname ~ '^wind_lidar_data_[0-9]{8}$'
    LOOP
        normalized_name :=
            'wind_lidar_data_' ||
            SUBSTRING(old_partition.relname FROM 17 FOR 4) || '_' ||
            SUBSTRING(old_partition.relname FROM 21 FOR 2) || '_' ||
            SUBSTRING(old_partition.relname FROM 23 FOR 2);

        IF to_regclass(normalized_name) IS NULL THEN
            EXECUTE format(
                'ALTER TABLE %I RENAME TO %I',
                old_partition.relname,
                normalized_name
            );
        END IF;
    END LOOP;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 分區表（按天，2026-03-27 至 2026-04-15）
-- ─────────────────────────────────────────────────────────────────────────────

-- 2026 年 3 月
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_27 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-27 00:00:00+00') TO ('2026-03-28 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_28 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-28 00:00:00+00') TO ('2026-03-29 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_29 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-29 00:00:00+00') TO ('2026-03-30 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_30 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-30 00:00:00+00') TO ('2026-03-31 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_31 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-31 00:00:00+00') TO ('2026-04-01 00:00:00+00');

-- 2026 年 4 月
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_01 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-04-02 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_02 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-02 00:00:00+00') TO ('2026-04-03 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_03 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-03 00:00:00+00') TO ('2026-04-04 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_04 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-04 00:00:00+00') TO ('2026-04-05 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_05 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-05 00:00:00+00') TO ('2026-04-06 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_06 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-06 00:00:00+00') TO ('2026-04-07 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_07 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-07 00:00:00+00') TO ('2026-04-08 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_08 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-08 00:00:00+00') TO ('2026-04-09 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_09 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-09 00:00:00+00') TO ('2026-04-10 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_10 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-10 00:00:00+00') TO ('2026-04-11 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_11 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-11 00:00:00+00') TO ('2026-04-12 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_12 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-12 00:00:00+00') TO ('2026-04-13 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_13 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-13 00:00:00+00') TO ('2026-04-14 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_14 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-14 00:00:00+00') TO ('2026-04-15 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_15 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-15 00:00:00+00') TO ('2026-04-16 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_16 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-16 00:00:00+00') TO ('2026-04-17 00:00:00+00');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 索引
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wl_station   ON wind_lidar_data(station_id);
CREATE INDEX IF NOT EXISTS idx_wl_time      ON wind_lidar_data(measure_time);
CREATE INDEX IF NOT EXISTS idx_wl_height    ON wind_lidar_data(height_m);
CREATE INDEX IF NOT EXISTS idx_wl_parameter ON wind_lidar_data(parameter_id);
CREATE INDEX IF NOT EXISTS idx_wl_quality   ON wind_lidar_data(data_quality);
-- 垂直剖面複合索引（最常用查詢）
CREATE INDEX IF NOT EXISTS idx_wl_station_time_height
    ON wind_lidar_data(station_id, measure_time, height_m);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 彙總視圖（最近 1 小時，pivot 回寬表格式）
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS wind_lidar_latest;

CREATE VIEW wind_lidar_latest AS
SELECT
    s.station_id,
    d.measure_time,
    d.measure_time AT TIME ZONE 'Asia/Taipei' AS measure_time_tw,
    d.height_m,
    MAX(CASE WHEN d.parameter_id = 'hsp'      THEN d.value END) AS hsp,
    MAX(CASE WHEN d.parameter_id = 'vsp'      THEN d.value END) AS vsp,
    MAX(CASE WHEN d.parameter_id = 'wdir'     THEN d.value END) AS wdir,
    MAX(CASE WHEN d.parameter_id = 'turb'     THEN d.value END) AS turb,
    MAX(CASE WHEN d.parameter_id = 'min_int'  THEN d.value END) AS min_int,
    MAX(CASE WHEN d.parameter_id = 'mean_int' THEN d.value END) AS mean_int,
    MAX(CASE WHEN d.parameter_id = 'n_samples' THEN d.value END) AS n_samples
FROM wind_lidar_stations s
JOIN wind_lidar_data d ON s.station_id = d.station_id
WHERE d.measure_time >= (SELECT MAX(measure_time) FROM wind_lidar_data) - INTERVAL '1 hour'
    AND d.data_quality = 'good'
GROUP BY s.station_id, d.measure_time, d.height_m
ORDER BY d.measure_time DESC, d.height_m ASC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 資料品質檢查函數
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_wind_lidar_quality()
RETURNS TABLE(
    station_id         VARCHAR(20),
    total_records      BIGINT,
    valid_records      BIGINT,
    invalid_records    BIGINT,
    data_quality_ratio NUMERIC(5, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.station_id,
        COUNT(d.station_id)                                         AS total_records,
        COUNT(CASE WHEN d.data_quality = 'good'    THEN 1 END)     AS valid_records,
        COUNT(CASE WHEN d.data_quality = 'invalid' THEN 1 END)     AS invalid_records,
        ROUND(
            CASE
                WHEN COUNT(d.station_id) = 0 THEN 0
                ELSE COUNT(CASE WHEN d.data_quality = 'good' THEN 1 END)::NUMERIC
                     / NULLIF(COUNT(d.station_id), 0)::NUMERIC * 100
            END, 2
        )                                                           AS data_quality_ratio
    FROM wind_lidar_stations s
    LEFT JOIN wind_lidar_data d ON s.station_id = d.station_id
    GROUP BY s.station_id
    ORDER BY s.station_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 註解
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE wind_lidar_stations   IS 'WindLidar 風光達儀器基本資料';
COMMENT ON TABLE wind_lidar_parameters IS 'WindLidar 量測參數種類（7 項）';
COMMENT ON TABLE wind_lidar_data       IS 'WindLidar 量測資料（分區表，按天，2026-03-27 至 2026-04-15）';
COMMENT ON VIEW  wind_lidar_latest     IS '最近 1 小時 WindLidar 量測資料（寬表格式）';
COMMENT ON FUNCTION check_wind_lidar_quality() IS '檢查 WindLidar 資料品質統計';
