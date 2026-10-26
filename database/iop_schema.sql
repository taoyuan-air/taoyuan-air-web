-- IOP（密集觀測）資料庫架構
-- 建立日期: 2026-10-24
-- 內容:
--   iop_events   IOP 清單（名稱與起訖日期）
--   vocs_variables VOCs 變數（物種，59 種，GC-FID 分析）
--   vocs_samples VOCs 採樣罐（觸發採樣 / 無人機採樣，一罐一列）
--   vocs_data    VOCs 濃度（一罐 × 一物種一列）
-- 風光達、無人機、空品站等既有資料不複製，網頁依 iop_events 的日期到原本的資料表篩選

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. IOP 清單
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iop_events (
    iop_id      VARCHAR(10)  PRIMARY KEY,          -- 'IOP1'
    iop_name    VARCHAR(50)  NOT NULL,             -- '2026 IOP1'
    start_date  DATE         NOT NULL,
    end_date    DATE         NOT NULL,
    description TEXT,
    created_at  TIMESTAMP    DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

INSERT INTO iop_events (iop_id, iop_name, start_date, end_date, description)
VALUES
    ('IOP1', '2026 IOP1', '2026-03-27', '2026-04-03', '2026 年第一次密集觀測'),
    ('IOP2', '2026 IOP2', '2026-08-17', '2026-08-24', '2026 年第二次密集觀測')
ON CONFLICT (iop_id) DO UPDATE SET
    iop_name    = EXCLUDED.iop_name,
    start_date  = EXCLUDED.start_date,
    end_date    = EXCLUDED.end_date,
    description = EXCLUDED.description;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. VOCs 變數（物種，順序同原始檔欄位）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vocs_variables (
    variables_id   SMALLINT     PRIMARY KEY,        -- 原始檔欄位順序 1–59
    variables_name VARCHAR(50)  NOT NULL UNIQUE,    -- 'Ethane'
    unit           VARCHAR(10)  NOT NULL            -- 'ppbv'（CFC 類為 'pptv'）
);

INSERT INTO vocs_variables (variables_id, variables_name, unit)
VALUES
    ( 1, 'Ethane',                  'ppbv'),
    ( 2, 'Ethylene',                'ppbv'),
    ( 3, 'Propane',                 'ppbv'),
    ( 4, 'Propylene',               'ppbv'),
    ( 5, 'Isobutane',               'ppbv'),
    ( 6, 'Butane',                  'ppbv'),
    ( 7, 'trans-2-Butene',          'ppbv'),
    ( 8, '1-Butene',                'ppbv'),
    ( 9, 'cis-2-Butene',            'ppbv'),
    (10, 'Isopentane',              'ppbv'),
    (11, 'Cyclopentane',            'ppbv'),
    (12, 'Pentane',                 'ppbv'),
    (13, 'trans-2-Pentene',         'ppbv'),
    (14, '1-Pentene',               'ppbv'),
    (15, 'cis-2-Pentene',           'ppbv'),
    (16, '2,2-Dimethylbutane',      'ppbv'),
    (17, '2,3-Dimethylbutane',      'ppbv'),
    (18, '2-Methylpentane',         'ppbv'),
    (19, '3-Methylpentane',         'ppbv'),
    (20, 'Isoprene',                'ppbv'),
    (21, '1-Hexene',                'ppbv'),
    (22, 'n-Hexane',                'ppbv'),
    (23, 'Methylcyclopentane',      'ppbv'),
    (24, '2,4-Dimethylpentane',     'ppbv'),
    (25, 'Benzene',                 'ppbv'),
    (26, 'Cyclohexane',             'ppbv'),
    (27, '2-Methylhexane',          'ppbv'),
    (28, '2,3-Dimethylpentane',     'ppbv'),
    (29, '3-Methylhexane',          'ppbv'),
    (30, '2,2,4-Trimethylpentane',  'ppbv'),
    (31, 'Heptane',                 'ppbv'),
    (32, 'Methylcyclohexane',       'ppbv'),
    (33, '2,3,4-Trimethylpentane',  'ppbv'),
    (34, 'Toluene',                 'ppbv'),
    (35, '2-Methylheptane',         'ppbv'),
    (36, '3-Methylheptane',         'ppbv'),
    (37, 'Octane',                  'ppbv'),
    (38, 'Ethylbenzene',            'ppbv'),
    (39, 'm,p-Xylene',              'ppbv'),
    (40, 'Styrene',                 'ppbv'),
    (41, 'o-Xylene',                'ppbv'),
    (42, 'Nonane',                  'ppbv'),
    (43, 'Isopropylbenzene',        'ppbv'),
    (44, 'Propylbenzene',           'ppbv'),
    (45, 'm-Ethyltoluene',          'ppbv'),
    (46, 'p-Ethyltoluene',          'ppbv'),
    (47, '1,3,5-Trimethylbenzene',  'ppbv'),
    (48, 'o-Ethyltoluene',          'ppbv'),
    (49, '1,2,4-Trimethylbenzene',  'ppbv'),
    (50, 'Decane',                  'ppbv'),
    (51, '1,2,3-Trimethylbenzene',  'ppbv'),
    (52, 'm-Diethylbenzene',        'ppbv'),
    (53, 'p-Diethylbenzene',        'ppbv'),
    (54, 'Undecane',                'ppbv'),
    (55, 'Dodecane',                'ppbv'),
    (56, 'CFC-12',                  'pptv'),
    (57, 'CFC-11',                  'pptv'),
    (58, 'CFC-113',                 'pptv'),
    (59, 'CCl4',                    'pptv')
ON CONFLICT (variables_id) DO UPDATE SET
    variables_name = EXCLUDED.variables_name,
    unit           = EXCLUDED.unit;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VOCs 採樣罐（一罐一列）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vocs_samples (
    sample_id     SERIAL        PRIMARY KEY,
    iop_id        VARCHAR(10)   REFERENCES iop_events(iop_id),  -- 不在任何 IOP 期間內為 NULL
    site          VARCHAR(30)   NOT NULL,          -- 'Guanyin' / 'Dayuan'
    sampling_type VARCHAR(10)   NOT NULL CHECK (sampling_type IN ('trigger', 'uav')),
    sample_time   TIMESTAMP     NOT NULL,
    batch         SMALLINT,                        -- 無人機採樣批次（觸發採樣為 NULL）
    height_m      NUMERIC(6, 1),                   -- 無人機採樣高度（觸發採樣為 NULL）
    canister_no   VARCHAR(20)   NOT NULL,          -- 採樣罐編號，如 '0488'、'AS004'
    source_file   VARCHAR(255),
    created_at    TIMESTAMP     DEFAULT NOW(),
    UNIQUE (site, sampling_type, sample_time, canister_no)
);

CREATE INDEX IF NOT EXISTS idx_vocs_samples_iop  ON vocs_samples(iop_id);
CREATE INDEX IF NOT EXISTS idx_vocs_samples_time ON vocs_samples(sample_time);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VOCs 濃度（一罐 × 一物種一列）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vocs_data (
    sample_id    INTEGER        NOT NULL REFERENCES vocs_samples(sample_id) ON DELETE CASCADE,
    variables_id SMALLINT       NOT NULL REFERENCES vocs_variables(variables_id),
    value        NUMERIC(12, 4),                   -- 濃度；未檢出為 NULL
    flag         VARCHAR(10),                      -- 原始標記，如 'N.D.'（有數值時為 NULL）
    PRIMARY KEY (sample_id, variables_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 註解
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE iop_events   IS 'IOP 密集觀測清單';
COMMENT ON TABLE vocs_variables IS 'VOCs 變數（物種，GC-FID，59 種）';
COMMENT ON TABLE vocs_samples IS 'VOCs 採樣罐（觸發採樣 / 無人機採樣）';
COMMENT ON TABLE vocs_data    IS 'VOCs 濃度（未檢出 value 為 NULL、flag 為 N.D.）';
