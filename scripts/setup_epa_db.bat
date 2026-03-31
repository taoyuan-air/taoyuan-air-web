@echo off
setlocal
set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"
if defined CI set "NO_PAUSE=1"
if /I "%GITHUB_ACTIONS%"=="true" set "NO_PAUSE=1"

echo ============================================================
echo EPA Station Database Setup Tool
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

REM Execute Schema initialization
echo [4/5] Initializing database schema...
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database\epa_stations_schema.sql
if errorlevel 1 (
    echo X Schema initialization failed
    call :maybe_pause
    exit /b 1
)
echo OK Schema initialization completed
echo.

REM Ensure pollutant dictionary exists
echo [5/5] Ensuring epa_pollutants dictionary...
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS epa_pollutants ( pollutant_id VARCHAR(10) PRIMARY KEY, pollutant_name VARCHAR(50) NOT NULL, pollutant_eng_name VARCHAR(50) NOT NULL, unit VARCHAR(20) NOT NULL, aggregation_type VARCHAR(20) NOT NULL DEFAULT '1hr_mean', description TEXT, created_at TIMESTAMP DEFAULT NOW() ); INSERT INTO epa_pollutants (pollutant_id, pollutant_name, pollutant_eng_name, unit, aggregation_type, description) VALUES ('1',N'二氧化硫','SO2','ppb','1hr_mean',NULL), ('2',N'一氧化碳','CO','ppm','1hr_mean',NULL), ('3',N'臭氧','O3','ppb','1hr_mean',NULL), ('7',N'二氧化氮','NO2','ppb','1hr_mean',NULL), ('4',N'懸浮微粒','PM10',N'μg/m³','1hr_mean',NULL), ('33',N'細懸浮微粒','PM2.5',N'μg/m³','1hr_mean',NULL) ON CONFLICT (pollutant_id) DO UPDATE SET pollutant_name = EXCLUDED.pollutant_name, pollutant_eng_name = EXCLUDED.pollutant_eng_name, unit = EXCLUDED.unit, aggregation_type = EXCLUDED.aggregation_type, description = EXCLUDED.description;"
if errorlevel 1 (
    echo X Failed to ensure epa_pollutants dictionary
    call :maybe_pause
    exit /b 1
)
echo OK epa_pollutants dictionary is ready
echo.

echo ============================================================
echo Database setup completed!
echo ============================================================
echo.
echo Next steps:
echo   1. Ensure required environment variables are configured (e.g. database connection settings).
echo   2. Install Python dependencies:
echo        pip install -r scripts\requirements.txt
echo   3. Run the data import script:
echo        python scripts\import_epa_stations.py
echo.
call :maybe_pause
exit /b 0

:maybe_pause
if defined NO_PAUSE goto :eof
pause
goto :eof