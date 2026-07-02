-- 1. 查看前 20 筆檢測點源的基本資訊
SELECT ems_no, fac_name, emi_chimney, latitude, longitude
FROM exam_sources
LIMIT 20;

-- 2. 統計各檢測項目的總檢測次數與平均濃度
SELECT 
    item_id,
    COUNT(*) as total_exams,
    ROUND(AVG(exam_value)::numeric, 6) as avg_concentration,
    MAX(exam_value) as max_concentration
FROM exam_records
GROUP BY item_id
ORDER BY total_exams DESC;

-- 3. 查詢特定工廠的所有檢測紀錄 
SELECT 
    s.fac_name,
    s.emi_chimney,
    r.exam_date,
    r.item_id,
    r.exam_value,
    r.exam_units
FROM exam_sources s
JOIN exam_records r ON s.source_id = r.source_id
WHERE s.fac_name LIKE '%焚化廠%'
ORDER BY r.exam_date DESC;

-- 4. 寬表視圖：使用剛剛建立的 latest_exam_summary 比對各項污染物最新值
SELECT * FROM latest_exam_summary LIMIT 15;

-- 5. 尋找「特定區域」的檢測紀錄 
SELECT 
    s.fac_name,
    s.emi_chimney,
    r.exam_date,
    r.item_id,
    r.exam_value
FROM exam_sources s
JOIN exam_records r ON s.source_id = r.source_id
WHERE s.latitude BETWEEN 24.8 AND 25.1
  AND s.longitude BETWEEN 121.1 AND 121.4
ORDER BY r.exam_date DESC
LIMIT 20;

-- 6. 找出某一檢測項目濃度最高的紀錄
SELECT 
    s.fac_name,
    s.emi_chimney,
    r.exam_date,
    r.exam_value,
    r.exam_units
FROM exam_sources s
JOIN exam_records r ON s.source_id = r.source_id
WHERE r.item_id = 'HG'
ORDER BY r.exam_value DESC
LIMIT 10;

-- 7. 檢查資料中是否有「檢測異常」或「未完成審核」的紀錄
SELECT 
    exam_status,
    COUNT(*) as count
FROM exam_records
GROUP BY exam_status;

-- 8. 空間查詢：找出距離中央大學 5 公里內的檢測點
SELECT 
    s.fac_name,
    s.emi_chimney,
    ROUND(ST_Distance(
        s.location::geography, 
        ST_SetSRID(ST_MakePoint(121.192, 24.968), 4326)::geography
    )::numeric / 1000, 2) as distance_km
FROM exam_sources s
WHERE ST_DWithin(
    s.location::geography, 
    ST_SetSRID(ST_MakePoint(121.192, 24.968), 4326)::geography, 
    5000
)
ORDER BY distance_km;

-- 9. 檢查是否有重複的 ems_no + emi_chimney 
SELECT ems_no, emi_chimney, COUNT(*) 
FROM exam_sources 
GROUP BY ems_no, emi_chimney 
HAVING COUNT(*) > 1;

-- 10. 找出「檢測值超過特定標準」的紀錄 
SELECT 
    s.fac_name,
    r.exam_date,
    r.exam_value,
    r.item_id
FROM exam_sources s
JOIN exam_records r ON s.source_id = r.source_id
WHERE r.item_id = 'HG'
  AND r.exam_value > 0.05
ORDER BY r.exam_value DESC;