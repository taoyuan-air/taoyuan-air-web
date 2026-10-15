-- ============================================================
-- AOD 衛星氣膠資料庫架構（MAIAC MCD19A2.061）
-- 系統：桃園 3D Geo-AI 大氣品質預測系統
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- 1. 衛星基本資料
-- ============================================================
CREATE TABLE IF NOT EXISTS aod_satellites (
    satellite_id    VARCHAR(10)  PRIMARY KEY,              -- TERRA / AQUA
    satellite_name  VARCHAR(50)  NOT NULL,
    product         VARCHAR(30)  NOT NULL,                 -- MCD19A2
    collection      VARCHAR(10)  NOT NULL,                 -- 061
    resolution_m    INTEGER,                               -- 原始解析度 1000
    overpass_local  VARCHAR(20),                           -- 過境桃園的大約時間（台灣時間）
    is_active       BOOLEAN      DEFAULT true,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

INSERT INTO aod_satellites (satellite_id, satellite_name, product, collection, resolution_m, overpass_local) VALUES
    ('TERRA', 'Terra', 'MCD19A2', '061', 1000, '09:30–11:15'),
    ('AQUA',  'Aqua',  'MCD19A2', '061', 1000, '12:25–14:05')
ON CONFLICT (satellite_id) DO NOTHING;

-- ============================================================
-- 2. 0.01° 網格（桃園、新北、臺北、新竹，共 12,726 格）
--    由 scripts/import_maiac_aod.py 步驟 1 建立，縣市由內政部縣市界線補上
-- ============================================================
CREATE TABLE IF NOT EXISTS aod_grids (
    grid_id          VARCHAR(20)  PRIMARY KEY,             -- N2477E12105 = 北緯 24.77、東經 121.05
    grid_row         INTEGER      NOT NULL,                -- 由南往北，0 = 北緯 24.35
    grid_col         INTEGER      NOT NULL,                -- 由西往東，0 = 東經 120.80
    latitude         NUMERIC(7,4) NOT NULL,                -- 格點中心
    longitude        NUMERIC(8,4) NOT NULL,
    location         GEOMETRY(Point, 4326),
    county           VARCHAR(20),                          -- 臺北市、新北市、桃園市…；海上為 NULL
    in_taoyuan_grid  BOOLEAN      DEFAULT false,           -- 在 PM2.5 補值的桃園範圍內（算 dAOD 用）
    created_at       TIMESTAMPTZ  DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  DEFAULT NOW(),
    CONSTRAINT uq_aod_grid_rowcol UNIQUE (grid_row, grid_col)
);

-- ============================================================
-- 3. 每日 AOD 與模型特徵（分區表）
--    只存通過 QA 的格點：沒有 row = 當天該格沒有有效值
--    aod ~ known_issue 由 import_maiac_aod.py 步驟 2 寫入
--    daod ~ aod_valid  由 import_maiac_aod.py 步驟 3 計算後補上
-- ============================================================
CREATE TABLE IF NOT EXISTS aod_daily_data (
    id              BIGSERIAL,
    grid_id         VARCHAR(20)  NOT NULL,
    obs_date        DATE         NOT NULL,                 -- 台灣時間的日期
    satellite_id    VARCHAR(10)  NOT NULL,
    aod             NUMERIC(6,4) NOT NULL,                 -- 550 nm AOD
    known_issue     VARCHAR(30),                           -- C61_2022_LOW_BIAS
    daod            NUMERIC(6,4),                          -- AOD − 當天桃園範圍 P05
    aod_mean3       NUMERIC(6,4),
    aod_std3        NUMERIC(6,4),
    aod_mean7       NUMERIC(6,4),
    aod_std7        NUMERIC(6,4),
    frac3           NUMERIC(4,3),
    frac7           NUMERIC(4,3),
    aod_valid       BOOLEAN,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),
    PRIMARY KEY (id, obs_date),
    FOREIGN KEY (grid_id)      REFERENCES aod_grids(grid_id),
    FOREIGN KEY (satellite_id) REFERENCES aod_satellites(satellite_id),
    UNIQUE (grid_id, obs_date, satellite_id)
) PARTITION BY RANGE (obs_date);
-- 月分區（aod_daily_data_YYYY_MM）由 import_maiac_aod.py 自動建立

-- ============================================================
-- 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_aod_daily_date_sat ON aod_daily_data (obs_date, satellite_id);
CREATE INDEX IF NOT EXISTS idx_aod_grids_location ON aod_grids USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_aod_grids_county   ON aod_grids (county);
