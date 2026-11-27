-- IOP 微型感測器（LCS，Low-Cost Sensor）資料庫架構
-- 建立日期: 2026-11-24
-- 需先執行 database/iop_schema.sql（iop_events）
-- 內容:
--   iop_lcs_variables 量測項目（PM2.5、O3、NO2、CO、TVOC、溫度、濕度、氣壓）
--   iop_lcs_samples   採樣（一站 × 一小時一列，記錄設備與經緯度）
--   iop_lcs_data      觀測資料（一樣本 × 一變數一列）
--
-- 原始檔：LCS_AeroboxGas_L2_{測站}_{年}IOP{n}_TYDEPproject.txt
--   缺值 -999 不匯入；QC 剔除 -888 存成 flag = 'QC'

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 量測項目（順序同原始檔欄位）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iop_lcs_variables (
    variables_id   SMALLINT     PRIMARY KEY,        -- 同原始檔欄位順序（1–8）
    variables_name VARCHAR(50)  NOT NULL UNIQUE,    -- 同原始檔欄名（原始檔 PM25 存成 PM2.5）
    unit           VARCHAR(30)  NOT NULL
);

INSERT INTO iop_lcs_variables (variables_id, variables_name, unit)
VALUES
    (1, 'PM2.5', 'μg/m3'),
    (2, 'O3',    'ppb'),
    (3, 'NO2',   'ppb'),
    (4, 'CO',    'ppm'),
    (5, 'TVOC',  'ppm'),
    (6, 'T',     '°C'),
    (7, 'RH',    '%'),
    (8, 'P',     'hPa')
ON CONFLICT (variables_id) DO UPDATE SET
    variables_name = EXCLUDED.variables_name,
    unit           = EXCLUDED.unit;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 採樣（每小時一筆；時間為台灣時間，代表該小時的開始）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iop_lcs_samples (
    sample_id    SERIAL         PRIMARY KEY,
    iop_id       VARCHAR(10)    NOT NULL REFERENCES iop_events(iop_id),
    site         VARCHAR(30)    NOT NULL,          -- 'Guanyin' / 'Xinwu' / 'NCU'
    sample_time  TIMESTAMP      NOT NULL,          -- 原始檔 Time 欄（09:00 = 09:00–09:59）
    device_id    VARCHAR(30),                      -- 檔頭 Device_ID，如 'ab170022'
    latitude     NUMERIC(10, 7),                   -- 檔頭 Latitude
    longitude    NUMERIC(10, 7),                   -- 檔頭 Longitude
    source_file  VARCHAR(255),
    created_at   TIMESTAMP      DEFAULT NOW(),
    UNIQUE (site, sample_time)
);

CREATE INDEX IF NOT EXISTS idx_iop_lcs_samples_iop ON iop_lcs_samples(iop_id, site);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 觀測資料
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iop_lcs_data (
    sample_id    INTEGER        NOT NULL REFERENCES iop_lcs_samples(sample_id) ON DELETE CASCADE,
    variables_id SMALLINT       NOT NULL REFERENCES iop_lcs_variables(variables_id),
    value        NUMERIC(12, 4),                   -- QC 剔除時為 NULL
    flag         VARCHAR(5)     CHECK (flag IN ('QC')),
    PRIMARY KEY (sample_id, variables_id),
    CHECK (value IS NOT NULL OR flag IS NOT NULL)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 註解
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE iop_lcs_variables IS 'IOP 微型感測器觀測變數';
COMMENT ON TABLE iop_lcs_samples   IS 'IOP 微型感測器採樣（一站 × 一小時一列）';
COMMENT ON TABLE iop_lcs_data      IS 'IOP 微型感測器觀測資料';
COMMENT ON COLUMN iop_lcs_samples.sample_time IS '台灣時間，代表該小時的開始（09:00 = 09:00–09:59）';
COMMENT ON COLUMN iop_lcs_data.flag IS 'QC = 原始檔 -888（QC 剔除）；缺值 -999 不匯入';
