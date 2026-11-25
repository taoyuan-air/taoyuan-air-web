-- IOP 大氣汞（Hg）採樣資料庫架構
-- 建立日期: 2026-11-24
-- 需先執行 database/iop_schema.sql（iop_events）
-- 內容:
--   iop_hg_variables 汞物種（GEM、GOM、PBM）
--   iop_hg_samples   汞採樣樣本（測站 × 日期一列）
--   iop_hg_data      分析結果（一樣本 × 一物種一列）
--
-- 原始檔：Hg_Sampler_{測站}_{年}IOP{n}_TYDEPproject.xlsx
--   格式同氣膠化學：第 1 列欄名（Date/Unit、GEM、GOM、PBM），第 2 列單位，日期為民國年

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 汞物種（順序同原始檔欄位）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iop_hg_variables (
    variables_id   SMALLINT     PRIMARY KEY,        -- 同原始檔欄位順序（1–3）
    variables_name VARCHAR(50)  NOT NULL UNIQUE,    -- 同原始檔欄名（GEM、GOM、PBM）
    unit           VARCHAR(30)  NOT NULL
);

-- GEM 氣態元素汞、GOM 氣態氧化汞、PBM 顆粒態汞
INSERT INTO iop_hg_variables (variables_id, variables_name, unit)
VALUES
    (1, 'GEM', 'ng/m3'),
    (2, 'GOM', 'pg/m3'),
    (3, 'PBM', 'pg/m3')
ON CONFLICT (variables_id) DO UPDATE SET
    variables_name = EXCLUDED.variables_name,
    unit           = EXCLUDED.unit;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 採樣樣本（一天一筆）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iop_hg_samples (
    sample_id    SERIAL       PRIMARY KEY,
    iop_id       VARCHAR(10)  REFERENCES iop_events(iop_id),
    site         VARCHAR(30)  NOT NULL,            -- 'Guanyin'
    sample_date  DATE         NOT NULL,            -- 採樣日（= 開始時間的日期）
    start_time   TIMESTAMP,                        -- 採樣開始（台灣時間），依匯入程式的採樣時間表
    end_time     TIMESTAMP,                        -- 採樣結束（台灣時間）
    file_date    VARCHAR(20),                      -- 原始檔 Date 欄的字串（如 115/03/27），留著對照
    source_file  VARCHAR(255),
    created_at   TIMESTAMP    DEFAULT NOW(),
    UNIQUE (site, sample_date),
    CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_iop_hg_samples_iop ON iop_hg_samples(iop_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 分析結果
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iop_hg_data (
    sample_id    INTEGER        NOT NULL REFERENCES iop_hg_samples(sample_id) ON DELETE CASCADE,
    variables_id SMALLINT       NOT NULL REFERENCES iop_hg_variables(variables_id),
    value        NUMERIC(14, 6),                   -- 有標記時為 NULL
    flag         VARCHAR(5)     CHECK (flag IN ('NA', 'ND', 'NQ', 'N/A')),
    PRIMARY KEY (sample_id, variables_id),
    CHECK (value IS NOT NULL OR flag IS NOT NULL)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 註解
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE iop_hg_variables IS 'IOP 大氣汞物種';
COMMENT ON TABLE iop_hg_samples   IS 'IOP 大氣汞採樣樣本（一天一筆）';
COMMENT ON TABLE iop_hg_data      IS 'IOP 大氣汞分析結果';
COMMENT ON COLUMN iop_hg_samples.iop_id IS
    '以檔名的 IOP 為準（Hg_Sampler_Guanyin_2026IOP2 → IOP2）';
COMMENT ON COLUMN iop_hg_samples.file_date IS
    '原始檔 Date 欄。IOP2 檔案沿用 IOP1 的日期（115/03/27…），實際採樣時間依 scripts/import_iop_hg.py 的 SCHEDULE_2026 對應';
COMMENT ON COLUMN iop_hg_data.flag IS
    'NA 未分析、ND 未檢出、NQ 檢出但無法定量、N/A 不適用';
