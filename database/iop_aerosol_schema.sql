-- IOP 氣膠化學（濾紙採樣）資料庫架構
-- 建立日期: 2026-10-30
-- 需先執行 database/iop_schema.sql（iop_events）
-- 內容:
--   iop_aerosol_variables 氣膠化學變數（PM 質量、PCDD/Fs、PAHs、PFASs、金屬、離子）
--   iop_aerosol_samples   濾紙樣本（測站 × 粒徑 × 日期一列）
--   iop_aerosol_data      分析結果（一樣本 × 一變數一列）

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 氣膠化學變數（順序同原始檔欄位）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iop_aerosol_variables (
    variables_id   SMALLINT     PRIMARY KEY,
    variables_name VARCHAR(50)  NOT NULL UNIQUE,    -- 'PCDD/Fs'
    unit           VARCHAR(30)  NOT NULL            -- 'fg WHO-TEQ/m3'
);

INSERT INTO iop_aerosol_variables (variables_id, variables_name, unit)
VALUES
    (1, 'Mass',     'μg/m3'),             -- 原始檔欄名 PM2.5 / PM1.0，粒徑看 iop_aerosol_samples.pm_size
    (2, 'PCDD/Fs',  'fg WHO-TEQ/m3'),
    (3, '∑27PAHs',  'BaP-TEQ (ng/m3)'),
    (4, 'PFASs',    'pg/m3'),
    (5, 'Metals',   'μg/m3'),
    (6, 'Ions',     'μg/m3')
ON CONFLICT (variables_id) DO UPDATE SET
    variables_name = EXCLUDED.variables_name,
    unit           = EXCLUDED.unit;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 濾紙樣本（一天一張濾紙）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iop_aerosol_samples (
    sample_id    SERIAL       PRIMARY KEY,
    iop_id       VARCHAR(10)  REFERENCES iop_events(iop_id),
    site         VARCHAR(30)  NOT NULL,            -- 'Guanyin' / 'Xinwu' / 'NCU'
    pm_size      VARCHAR(10)  NOT NULL CHECK (pm_size IN ('PM2.5', 'PM1')),
    sample_date  DATE         NOT NULL,            -- 採樣日（原始檔民國年已轉西元）
    source_file  VARCHAR(255),
    created_at   TIMESTAMP    DEFAULT NOW(),
    UNIQUE (site, pm_size, sample_date)
);

CREATE INDEX IF NOT EXISTS idx_iop_aerosol_samples_iop ON iop_aerosol_samples(iop_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 分析結果
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iop_aerosol_data (
    sample_id    INTEGER        NOT NULL REFERENCES iop_aerosol_samples(sample_id) ON DELETE CASCADE,
    variables_id SMALLINT       NOT NULL REFERENCES iop_aerosol_variables(variables_id),
    value        NUMERIC(14, 6),                   -- 有標記時為 NULL
    flag         VARCHAR(5)     CHECK (flag IN ('NA', 'ND', 'NQ', 'N/A')),
    PRIMARY KEY (sample_id, variables_id),
    CHECK (value IS NOT NULL OR flag IS NOT NULL)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 註解
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE iop_aerosol_variables IS 'IOP 氣膠化學變數';
COMMENT ON TABLE iop_aerosol_samples   IS 'IOP 氣膠化學濾紙樣本（PM2.5 / PM1，一天一張）';
COMMENT ON TABLE iop_aerosol_data      IS 'IOP 氣膠化學分析結果';
COMMENT ON COLUMN iop_aerosol_data.flag IS
    'NA 未分析（樣品或分析條件限制）、ND 未檢出、NQ 檢出但無法定量、N/A 不適用';
