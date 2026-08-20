-- ============================================================
-- 通用固定污染源檢測資料庫架構 (戴奧辛、重金屬及氯化氫)
-- 系統：桃園 3D Geo-AI 大氣品質預測系統 (底層資料庫)
-- 資料來源：固定污染源戴奧辛、重金屬（鉛、鎘、汞）及氯化氫排放檢測資料
-- ============================================================

-- 0. 啟用必要的 PostgreSQL 擴充功能
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ============================================================
-- 1. 建立固定污染源排放管道基本資料表
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_sources (
    source_id       SERIAL PRIMARY KEY,                     
    ems_no          VARCHAR(15) NOT NULL,                 -- 管制編號 
    fac_name        VARCHAR(100) NOT NULL,                -- 工廠/設施名稱 
    emi_chimney     VARCHAR(20) NOT NULL,                 -- 排放管道編號 
    location        GEOMETRY(Point, 4326),                    
    latitude        DECIMAL(10, 7),                       -- 緯度 Lat
    longitude       DECIMAL(10, 7),                       -- 經度 Lon
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),

    CONSTRAINT unique_facility_chimney UNIQUE (ems_no, emi_chimney)
);

COMMENT ON TABLE  exam_sources             IS '固定污染源檢測-排放管道基本資料';
COMMENT ON COLUMN exam_sources.ems_no      IS '環境部/環保局管領之固定污染源管制編號';
COMMENT ON COLUMN exam_sources.emi_chimney IS '排放管道編號（一支煙囪可能對應多個管道）';

-- ============================================================
-- 2. 建立檢測項目定義表 
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_items (
    item_id         VARCHAR(20) PRIMARY KEY,                -- 項目內部標準代碼 (如 DIOXIN, HG, PB, CD, HCL)
    exam_item       VARCHAR(50) NOT NULL,                   -- 對應原始資料的 exam_item (如 '汞及其化合物')
    exam_units      VARCHAR(20),                            -- 對應原始資料常見的 exam_units 
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  exam_items             IS '固定污染源檢測項目定義表';
COMMENT ON COLUMN exam_items.exam_item   IS '對應 CSV 原始檢測中文名稱';

-- 插入本次資料集的 5 大核心檢測項目定義
INSERT INTO exam_items (item_id, exam_item, exam_units) VALUES
('DIOXIN', '戴奧辛及其化合物', 'ng-TEQ/Nm3'),
('HG',     '汞及其化合物',     'mg/Nm3'),
('PB',     '鉛及其化合物',     'mg/Nm3'),
('CD',     '鎘及其化合物',     'mg/Nm3'),
('HCL',    '氯化氫',           'ppm')
ON CONFLICT (item_id) DO UPDATE SET
    exam_item  = EXCLUDED.exam_item,
    exam_units = EXCLUDED.exam_units,
    updated_at = NOW();

-- ============================================================
-- 3. 建立檢測紀錄明細表 
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_records (
    record_id       BIGSERIAL PRIMARY KEY,
    source_id       INTEGER NOT NULL,                     -- 關聯 exam_sources.source_id
    item_id         VARCHAR(20) NOT NULL,                 -- 關聯 exam_items.item_id
    exam_date       DATE NOT NULL,                        -- 檢測日期 
    exam_value      DECIMAL(14, 6),                       -- 檢測濃度/數值 
    exam_units      VARCHAR(20),                          -- 實際報告單位 
    exam_status     VARCHAR(30),                          -- 審核狀態 
    created_at      TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (source_id) REFERENCES exam_sources(source_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id)   REFERENCES exam_items(item_id),
    
    CONSTRAINT unique_exam_record UNIQUE (source_id, item_id, exam_date)
);

COMMENT ON TABLE  exam_records            IS '固定污染源定期/不定期檢測濃度紀錄明細';
COMMENT ON COLUMN exam_records.exam_value IS '檢測數值，保留小數點後6位以精準記錄微量數值';

-- ============================================================
-- 4. 建立索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_exam_sources_location  ON exam_sources USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_exam_sources_ems_no    ON exam_sources(ems_no);
CREATE INDEX IF NOT EXISTS idx_exam_records_source    ON exam_records(source_id);
CREATE INDEX IF NOT EXISTS idx_exam_records_item      ON exam_records(item_id);
CREATE INDEX IF NOT EXISTS idx_exam_records_date      ON exam_records(exam_date DESC);
CREATE INDEX IF NOT EXISTS idx_exam_records_composite ON exam_records(source_id, item_id, exam_date);

-- ============================================================
-- 5. 建立分析用彙總視圖 
-- ============================================================
CREATE OR REPLACE VIEW latest_exam_summary AS
WITH latest_dates AS (
    SELECT source_id, item_id, MAX(exam_date) AS max_date
    FROM exam_records
    GROUP BY source_id, item_id
)
SELECT 
    s.source_id,
    s.ems_no,
    s.fac_name,
    s.emi_chimney,
    s.latitude,
    s.longitude,
    MAX(CASE WHEN r.item_id = 'DIOXIN' THEN r.exam_value END) AS latest_dioxin_val,
    MAX(CASE WHEN r.item_id = 'DIOXIN' THEN r.exam_date END)  AS latest_dioxin_date,
    MAX(CASE WHEN r.item_id = 'HG'     THEN r.exam_value END) AS latest_hg_val,
    MAX(CASE WHEN r.item_id = 'HG'     THEN r.exam_date END)  AS latest_hg_date,
    MAX(CASE WHEN r.item_id = 'PB'     THEN r.exam_value END) AS latest_pb_val,
    MAX(CASE WHEN r.item_id = 'PB'     THEN r.exam_date END)  AS latest_pb_date,
    MAX(CASE WHEN r.item_id = 'CD'     THEN r.exam_value END) AS latest_cd_val,
    MAX(CASE WHEN r.item_id = 'CD'     THEN r.exam_date END)  AS latest_cd_date,
    MAX(CASE WHEN r.item_id = 'HCL'    THEN r.exam_value END) AS latest_hcl_val,
    MAX(CASE WHEN r.item_id = 'HCL'    THEN r.exam_date END)  AS latest_hcl_date
FROM exam_sources s
LEFT JOIN exam_records r ON s.source_id = r.source_id
LEFT JOIN latest_dates ld   ON r.source_id = ld.source_id 
                            AND r.item_id = ld.item_id 
                            AND r.exam_date = ld.max_date
GROUP BY s.source_id, s.ems_no, s.fac_name, s.emi_chimney, s.latitude, s.longitude;

-- ============================================================
-- 6. PostGIS 空間幾何更新語句 
-- ============================================================
UPDATE exam_sources
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE location IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL;