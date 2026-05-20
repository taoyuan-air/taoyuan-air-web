@echo off
REM TYDEP 測站資料庫建置腳本（原 setup_tepa_db.bat）
REM 執行前請確認 .env 已設定 POSTGRES_PASSWORD

echo ============================================================
echo  TYDEP 測站資料庫建置
echo ============================================================

echo [1/4] 啟動資料庫容器...
docker-compose up -d postgres
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker 啟動失敗，請確認 Docker Desktop 已開啟
    pause
    exit /b 1
)

echo [2/4] 等待資料庫就緒...
:WAIT_LOOP
docker exec taoyuan-air-db pg_isready -U taoyuan_user -d taoyuan_air >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    timeout /t 2 /nobreak >nul
    goto WAIT_LOOP
)
echo       資料庫已就緒

echo [3/4] 建立 TYDEP 資料表...
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database\tydep_stations_schema.sql
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Schema 建立失敗
    pause
    exit /b 1
)
echo       Schema 建立完成

echo [4/4] 匯入 TYDEP 歷史資料...
python scripts\import_tydep_stations.py
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 資料匯入失敗
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  完成！可執行以下指令驗證：
echo  docker exec -it taoyuan-air-db psql -U taoyuan_user -d taoyuan_air
echo  SELECT COUNT(*) FROM tydep_hourly_data;
echo  SELECT * FROM check_tydep_data_quality();
echo ============================================================
pause
