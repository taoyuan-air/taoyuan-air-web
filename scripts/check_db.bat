@echo off
chcp 65001 >nul
setlocal
set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"
if defined CI set "NO_PAUSE=1"
if /I "%GITHUB_ACTIONS%"=="true" set "NO_PAUSE=1"
REM Taoyuan Air - database health check
REM Usage: check_db.bat

echo ========================================
echo Taoyuan Air - Database Status
echo ========================================
echo.

echo [1] Check container status...
docker-compose ps
echo.

echo [2] Check PostgreSQL version...
docker exec taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -c "SELECT version();"
echo.

echo [3] Check PostGIS version...
docker exec taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -c "SELECT PostGIS_version();"
echo.

echo [4] Check tables...
docker exec taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -c "\dt public.*"
echo.

echo [5] Check row counts...
docker exec taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -c "SELECT CASE WHEN to_regclass('public.epa_stations') IS NULL THEN 'epa_stations: MISSING' ELSE 'epa_stations: ' || (SELECT COUNT(*)::text FROM epa_stations) END;"
docker exec taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -c "SELECT CASE WHEN to_regclass('public.epa_hourly_data') IS NULL THEN 'epa_hourly_data: MISSING' ELSE 'epa_hourly_data: ' || (SELECT COUNT(*)::text FROM epa_hourly_data) END;"
docker exec taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -c "SELECT 'epa_pollutants: ' || COUNT(*) FROM epa_pollutants;" 2>nul
if errorlevel 1 echo epa_pollutants: MISSING
echo.

echo ========================================
echo Check complete
echo ========================================
call :maybe_pause
exit /b 0

:maybe_pause
if defined NO_PAUSE goto :eof
pause
goto :eof
