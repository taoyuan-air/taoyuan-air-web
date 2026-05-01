@echo off
setlocal
set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"
if defined CI set "NO_PAUSE=1"
if /I "%GITHUB_ACTIONS%"=="true" set "NO_PAUSE=1"

echo ============================================================
echo MOE Station Database Setup Tool
echo ============================================================
echo.

REM Check if Docker is running
echo [1/5] Checking Docker service...
docker ps >nul 2>&1
if errorlevel 1 (
    echo X Docker is not running, please start Docker Desktop first
    call :maybe_pause
    exit /b 1
)
echo OK Docker is running
echo.

REM Start database container
echo [2/5] Starting database container...
docker-compose up -d postgres
if errorlevel 1 (
    echo X Failed to start database
    call :maybe_pause
    exit /b 1
)
echo OK Database started
echo.

REM Wait for database to be ready
echo [3/5] Waiting for database to be ready...
for /l %%i in (1,1,30) do (
    docker exec taoyuan-air-db pg_isready -U taoyuan_user -d taoyuan_air >nul 2>&1
    if not errorlevel 1 goto db_ready
    echo   - Database not ready yet, attempt %%i of 30, waiting...
    ping -n 3 127.0.0.1 >nul
)
echo X Database did not become ready within the expected time
call :maybe_pause
exit /b 1

:db_ready
echo OK Database ready
echo.

REM Execute Schema initialization (includes tables, partitions, stations, pollutants)
echo [4/5] Initializing database schema...
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database\moe_stations_schema.sql
if errorlevel 1 (
    echo X Schema initialization failed
    call :maybe_pause
    exit /b 1
)
echo OK Schema initialization completed
echo.

REM Verify setup
echo [5/5] Verifying setup...
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -c "SELECT COUNT(*) as station_count FROM moe_stations;"
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -c "SELECT COUNT(*) as pollutant_count FROM moe_pollutants;"
if errorlevel 1 (
    echo X Verification failed
    call :maybe_pause
    exit /b 1
)
echo OK Verification passed
echo.

echo ============================================================
echo Database setup completed!
echo ============================================================
echo.
echo Next steps:
echo   1. Ensure required environment variables are configured.
echo   2. Install Python dependencies:
echo        pip install -r scripts\requirements.txt
echo   3. Run the data import script:
echo        python scripts\import_moe_stations.py
echo.
call :maybe_pause
exit /b 0

:maybe_pause
if defined NO_PAUSE goto :eof
pause
goto :eof
