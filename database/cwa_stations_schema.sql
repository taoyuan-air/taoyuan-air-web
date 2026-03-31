-- 氣象測站資料庫完整架構
-- 專門用於儲存中央氣象署氣象測站的歷史和即時資料
-- 建立日期: 2026
-- 資料範圍: 2019-2026年

-- 0. 啟用必要的 PostgreSQL 擴充功能
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ========================================================
-- 1. 建立 CWA 測站基本資料表
-- ========================================================
CREATE TABLE IF NOT EXISTS cwa_stations (
    station_id      VARCHAR(20) PRIMARY KEY,
    station_name    VARCHAR(100) NOT NULL,
    county          VARCHAR(50) NOT NULL,
    station_type    VARCHAR(100) NOT NULL,
    location        GEOMETRY(Point, 4326),
    latitude        DECIMAL(10, 8),
    longitude       DECIMAL(11, 8),
    altitude        DECIMAL(8, 2),
    address         TEXT,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ========================================================
-- 2. 建立 CWA 氣象觀測項目定義表
-- ========================================================
CREATE TABLE IF NOT EXISTS cwa_observations (
    observation_id      VARCHAR(20) PRIMARY KEY,
    observation_name    VARCHAR(100) NOT NULL,
    unit                VARCHAR(20),
    aggregation_type    VARCHAR(50),                        -- 彙總方式（如：avg、sum、max、min）
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

-- ========================================================
-- 3. 建立 CWA 氣象小時值資料表（分區表）
-- ========================================================
CREATE TABLE IF NOT EXISTS cwa_hourly_data (
    id                      BIGSERIAL,
    station_id              VARCHAR(20) NOT NULL,
    monitor_date            TIMESTAMP NOT NULL,
    observation_id          VARCHAR(20) NOT NULL,
    concentration           VARCHAR(20),
    concentration_numeric   DECIMAL(10, 4),
    data_quality            VARCHAR(10) DEFAULT 'good',
    created_at              TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (id, monitor_date),                                             -- 複合主鍵：序列ID + 分區鍵
    FOREIGN KEY (station_id) REFERENCES cwa_stations(station_id),               -- 外鍵約束：關聯測站表
    FOREIGN KEY (observation_id) REFERENCES cwa_observations(observation_id),   -- 外鍵約束：關聯觀測項目表
    UNIQUE (station_id, monitor_date, observation_id)                           -- 唯一約束：防止同測站同時間同觀測項重複記錄
) PARTITION BY RANGE (monitor_date);

-- ========================================================
-- 4. 建立完整分區表（2019-2026年，按月份）
-- ========================================================

-- 2019年分區（從 03 月開始）
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2019_03 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2019-03-01') TO ('2019-04-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2019_04 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2019-04-01') TO ('2019-05-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2019_05 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2019-05-01') TO ('2019-06-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2019_06 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2019-06-01') TO ('2019-07-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2019_07 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2019-07-01') TO ('2019-08-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2019_08 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2019-08-01') TO ('2019-09-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2019_09 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2019-09-01') TO ('2019-10-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2019_10 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2019-10-01') TO ('2019-11-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2019_11 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2019-11-01') TO ('2019-12-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2019_12 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2019-12-01') TO ('2020-01-01');

-- 2020年分區
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2020_01 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2020-01-01') TO ('2020-02-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2020_02 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2020-02-01') TO ('2020-03-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2020_03 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2020-03-01') TO ('2020-04-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2020_04 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2020-04-01') TO ('2020-05-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2020_05 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2020-05-01') TO ('2020-06-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2020_06 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2020-06-01') TO ('2020-07-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2020_07 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2020-07-01') TO ('2020-08-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2020_08 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2020-08-01') TO ('2020-09-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2020_09 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2020-09-01') TO ('2020-10-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2020_10 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2020-10-01') TO ('2020-11-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2020_11 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2020-11-01') TO ('2020-12-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2020_12 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2020-12-01') TO ('2021-01-01');

-- 2021年分區
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2021_01 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2021-01-01') TO ('2021-02-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2021_02 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2021-02-01') TO ('2021-03-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2021_03 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2021-03-01') TO ('2021-04-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2021_04 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2021-04-01') TO ('2021-05-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2021_05 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2021-05-01') TO ('2021-06-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2021_06 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2021-06-01') TO ('2021-07-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2021_07 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2021-07-01') TO ('2021-08-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2021_08 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2021-08-01') TO ('2021-09-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2021_09 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2021-09-01') TO ('2021-10-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2021_10 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2021-10-01') TO ('2021-11-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2021_11 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2021-11-01') TO ('2021-12-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2021_12 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2021-12-01') TO ('2022-01-01');

-- 2022年分區
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2022_01 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2022-01-01') TO ('2022-02-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2022_02 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2022-02-01') TO ('2022-03-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2022_03 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2022-03-01') TO ('2022-04-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2022_04 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2022-04-01') TO ('2022-05-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2022_05 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2022-05-01') TO ('2022-06-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2022_06 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2022-06-01') TO ('2022-07-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2022_07 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2022-07-01') TO ('2022-08-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2022_08 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2022-08-01') TO ('2022-09-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2022_09 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2022-09-01') TO ('2022-10-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2022_10 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2022-10-01') TO ('2022-11-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2022_11 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2022-11-01') TO ('2022-12-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2022_12 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2022-12-01') TO ('2023-01-01');

-- 2023年分區
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2023_01 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2023-01-01') TO ('2023-02-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2023_02 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2023-02-01') TO ('2023-03-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2023_03 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2023-03-01') TO ('2023-04-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2023_04 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2023-04-01') TO ('2023-05-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2023_05 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2023-05-01') TO ('2023-06-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2023_06 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2023-06-01') TO ('2023-07-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2023_07 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2023-07-01') TO ('2023-08-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2023_08 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2023-08-01') TO ('2023-09-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2023_09 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2023-09-01') TO ('2023-10-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2023_10 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2023-10-01') TO ('2023-11-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2023_11 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2023-11-01') TO ('2023-12-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2023_12 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2023-12-01') TO ('2024-01-01');

-- 2024年分區
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2024_01 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2024_02 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2024_03 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2024_04 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2024_05 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2024_06 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2024_07 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2024_08 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2024_09 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2024_10 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2024_11 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2024_12 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- 2025年分區
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2025_01 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2025_02 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2025_03 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2025_04 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2025_05 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2025_06 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2025_07 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2025_08 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2025_09 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2025_10 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2025_11 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2025_12 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- 2026年分區
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2026_01 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2026_02 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS cwa_hourly_data_2026_03 PARTITION OF cwa_hourly_data FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- ========================================================
-- 5. 建立索引
-- ========================================================
CREATE INDEX IF NOT EXISTS idx_cwa_hourly_station      ON cwa_hourly_data(station_id);
CREATE INDEX IF NOT EXISTS idx_cwa_hourly_date          ON cwa_hourly_data(monitor_date);
CREATE INDEX IF NOT EXISTS idx_cwa_hourly_observation   ON cwa_hourly_data(observation_id);
CREATE INDEX IF NOT EXISTS idx_cwa_hourly_station_date  ON cwa_hourly_data(station_id, monitor_date);
CREATE INDEX IF NOT EXISTS idx_cwa_hourly_quality       ON cwa_hourly_data(data_quality);
CREATE INDEX IF NOT EXISTS idx_cwa_stations_location    ON cwa_stations USING GIST(location);

-- ========================================================
-- 6. 建立彙總視圖（方便查詢）
-- ========================================================
CREATE OR REPLACE VIEW cwa_latest_data AS
SELECT
    s.station_id,
    s.station_name,
    s.county,
    h.monitor_date,
    MAX(CASE WHEN h.observation_id = 'TX01' THEN h.concentration_numeric END) AS temperature,
    MAX(CASE WHEN h.observation_id = 'RH01' THEN h.concentration_numeric END) AS relative_humidity,
    MAX(CASE WHEN h.observation_id = 'PP01' THEN h.concentration_numeric END) AS precipitation,
    MAX(CASE WHEN h.observation_id = 'WD01' THEN h.concentration_numeric END) AS wind_speed,
    MAX(CASE WHEN h.observation_id = 'WD02' THEN h.concentration_numeric END) AS wind_direction,
    MAX(CASE WHEN h.observation_id = 'PS01' THEN h.concentration_numeric END) AS barometric_pressure
FROM cwa_stations s
JOIN cwa_hourly_data h ON s.station_id = h.station_id
WHERE h.monitor_date >= NOW() - INTERVAL '24 hours'
GROUP BY s.station_id, s.station_name, s.county, h.monitor_date
ORDER BY h.monitor_date DESC;

-- ========================================================
-- 7. 建立月度統計視圖
-- ========================================================
CREATE OR REPLACE VIEW cwa_monthly_stats AS
SELECT
    s.station_id,
    s.station_name,
    DATE_TRUNC('month', h.monitor_date) AS month,
    h.observation_id,
    o.observation_name,
    o.unit,
    COUNT(*)                            AS record_count,
    AVG(h.concentration_numeric)        AS avg_value,
    MIN(h.concentration_numeric)        AS min_value,
    MAX(h.concentration_numeric)        AS max_value,
    STDDEV(h.concentration_numeric)     AS std_value
FROM cwa_stations s
JOIN cwa_hourly_data h ON s.station_id = h.station_id
JOIN cwa_observations o ON h.observation_id = o.observation_id
WHERE h.concentration_numeric IS NOT NULL
GROUP BY s.station_id, s.station_name, DATE_TRUNC('month', h.monitor_date), h.observation_id, o.observation_name, o.unit
ORDER BY month DESC, s.station_id, h.observation_id;

-- ========================================================
-- 8. 插入桃園市測站基本資料與觀測項目定義
-- ========================================================
 
-- 8a. 插入觀測項目定義 ° hPa MJ/m² m/s
INSERT INTO cwa_observations (observation_id, observation_name, unit, aggregation_type) VALUES
('PP01',  '降水量',     'mm',    'hourly_acc'),
('PS01',  '測站氣壓',       'hPa',    '1min_inst'),
('RH01',  '相對溼度',     '%',    '1min_inst'),
('TX01',  '氣溫',         '℃',     '1min_inst'),
('WD01',  '平均風風速',   'm/s',   '10min_mean'),
('WD02',  '平均風風向',     '360 degree',    '10min_mean')
ON CONFLICT (observation_id) DO UPDATE SET
    observation_name = EXCLUDED.observation_name,
    unit             = EXCLUDED.unit,
    aggregation_type = EXCLUDED.aggregation_type,
    updated_at       = NOW();

-- 8b. 插入桃園市氣象測站（含有人站、自動站、農業站）
INSERT INTO cwa_stations (station_id, station_name, county, station_type, latitude, longitude, altitude, address) VALUES
-- 署屬有人站
('467050', '新屋', '桃園市', '署屬有人站', 25.006725, 121.047492, 20.6, '桃園市新屋區東興路二段946號'),
-- 署屬自動站
('C1C510', '水尾', '桃園市', '署屬自動站', 24.940081, 121.087161, 106.0, '桃園市楊梅區豐野里1鄰151號(富崗水尾工作站內)'),
('C0C800', '四稜', '桃園市', '署屬自動站', 24.64733, 121.4293, 1167.0, '桃園市復興區四稜段6地號'),
('C0C790', '東眼山', '桃園市', '署屬自動站', 24.8284, 121.40888, 858.0, '桃園市復興區東眼山段93地號'),
('C0C750', '新興坑尾', '桃園市', '署屬自動站', 25.0061, 121.0971, 72.0, '桃園市觀音區文化路石橋段453號'),
('C0C740', '觀音工業區', '桃園市', '署屬自動站', 25.064764, 121.114856, 5.3, '桃園市觀音區經建七路5號(觀音工業區汙水處理廠迴流汙泥站機房樓頂)'),
('C0C730', '中大臨海站', '桃園市', '署屬自動站', 24.966126, 121.008581, 5.0, '桃園市新屋區蚵殼港段深圳小段52-41號土地(中央大學臨海工作站)'),
('C0C720', '竹圍', '桃園市', '署屬自動站', 25.112692, 121.239824, 21.0, '桃園市大園區沙崙段沙崙小號00719-000建號(竹圍第一機動巡邏隊樓頂)'),
('C0C710', '大溪永福', '桃園市', '署屬自動站', 24.892936, 121.324975, 143.0, '桃園市大溪區信義路1165號（永福國小）'),
('C0C700', '中壢', '桃園市', '署屬自動站', 24.977661, 121.256375, 151.0, '桃園市中壢區成章四街120號(內壢高中樓頂)'),
('C0C680', '龜山', '桃園市', '署屬自動站', 25.02846, 121.38656, 228.0, '桃園市龜山區文化一路250號(國立體育大學田徑場)'),
('C0C670', '龍潭', '桃園市', '署屬自動站', 24.870056, 121.221389, 250.0, '桃園市龍潭區中興路726號（龍潭消防分隊）'),
('C0C660', '楊梅', '桃園市', '署屬自動站', 24.912375, 121.143047, 176.0, '桃園市楊梅區金華街100號(楊心國小)'),
('C0C650', '平鎮', '桃園市', '署屬自動站', 24.897503, 121.214636, 208.0, '桃園市平鎮區中豐路山頂段375巷45號(山豐國民小學校園內)'),
('C0C630', '大溪', '桃園市', '署屬自動站', 24.882853, 121.265547, 209.0, '桃園市大溪區員林路2段450號(員樹林國小校園內)'),
('C0C620', '蘆竹', '桃園市', '署屬自動站', 25.084275, 121.265767, 19.0, '桃園市蘆竹區坑口里14鄰旁'),
('C0C490', '八德', '桃園市', '署屬自動站', 24.928708, 121.283289, 157.0, '桃園市八德區興仁里中山路94號(八德國民小學校園內)'),
('C0C460', '復興', '桃園市', '署屬自動站', 24.820208, 121.352281, 482.0, '桃園市復興區澤仁里中正路248號(介壽國民中學校園內)'),
-- 農業站
('72C440', '桃園農改場', '桃園市', '農業站', 24.950944, 121.030583, 70.0, '桃園市新屋區後庄里16號'),
('82C160', '茶改場', '桃園市', '農業站', 24.908472, 121.185333, 195.0, '桃園市楊梅區金龍里中興路324號'),
('A2C560', '農工中心', '桃園市', '農業站', 24.985917, 121.239833, 121.0, '桃園市中壢區中園路196之1號'),
('C2C410', '中央大學', '桃園市', '農業站', 24.967652, 121.185165, 129.0, '桃園市中壢區中大路300號'),
('C2C590', '觀音', '桃園市', '農業站', 25.027072, 121.153317, 72.0, '桃園市觀音區廣福里10-42號(逸福農場)')
-- 其他測站依實際清單持續補充
ON CONFLICT (station_id) DO UPDATE SET
    station_name = EXCLUDED.station_name,
    station_type = EXCLUDED.station_type,
    latitude     = EXCLUDED.latitude,
    longitude    = EXCLUDED.longitude,
    altitude     = EXCLUDED.altitude,
    address      = EXCLUDED.address,
    updated_at   = NOW();

-- ========================================================
-- 9. 更新 location 欄位（PostGIS 幾何）
-- ========================================================
UPDATE cwa_stations
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE location IS NULL;

-- ========================================================
-- 10. 建立資料品質檢查函數
-- ========================================================
CREATE OR REPLACE FUNCTION check_cwa_data_quality()
RETURNS TABLE(
    station_id          VARCHAR(20),
    station_name        VARCHAR(100),
    total_records       BIGINT,
    valid_records       BIGINT,
    invalid_records     BIGINT,
    data_quality_ratio  NUMERIC(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.station_id,
        s.station_name,
        COUNT(h.station_id) AS total_records,                               -- 實際資料記錄數（忽略 NULL 值）
        COUNT(CASE WHEN h.data_quality = 'good'    THEN 1 END) AS valid_records,
        COUNT(CASE WHEN h.data_quality = 'invalid' THEN 1 END) AS invalid_records,
        ROUND(
            CASE
                WHEN COUNT(h.station_id) = 0 THEN 0                        -- 無資料時回傳 0%
                ELSE COUNT(CASE WHEN h.data_quality = 'good' THEN 1 END)::NUMERIC
                     / NULLIF(COUNT(h.station_id), 0)::NUMERIC * 100       -- 防止除零錯誤
            END,
            2
        ) AS data_quality_ratio
    FROM cwa_stations s
    LEFT JOIN cwa_hourly_data h ON s.station_id = h.station_id
    GROUP BY s.station_id, s.station_name
    ORDER BY s.station_id;
END;
$$ LANGUAGE plpgsql;

-- ========================================================
-- 註解
-- ========================================================
COMMENT ON TABLE cwa_stations     IS 'CWA 氣象測站基本資料';
COMMENT ON TABLE cwa_observations  IS 'CWA 氣象觀測項目定義';
COMMENT ON TABLE cwa_hourly_data   IS 'CWA 氣象小時值資料（分區表，2019-2026年）';
COMMENT ON VIEW  cwa_latest_data   IS '最近24小時的氣象觀測資料彙總';
COMMENT ON VIEW  cwa_monthly_stats IS 'CWA 測站月度統計資料';
COMMENT ON FUNCTION check_cwa_data_quality() IS '檢查 CWA 資料品質統計';
