@echo off
echo ============================================================
echo EPA Station Database Setup Tool
echo ============================================================
echo.

REM Check if Docker is running
echo [1/4] Checking Docker service...
docker ps >nul 2>&1
if errorlevel 1 (
    echo X Docker is not running, please start Docker Desktop first
    pause
    exit /b 1
)
echo OK Docker is running
echo.

REM Start database container
echo [2/4] Starting database container...
docker-compose up -d postgres
if errorlevel 1 (
    echo X Failed to start database
    pause
    exit /b 1
)
echo OK Database started
echo.

REM Wait for database to be ready
echo [3/4] Waiting for database to be ready...
timeout /t 5 /nobreak >nul
echo OK Database ready
echo.

REM Execute Schema initialization
echo [4/4] Initializing database schema...
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database\epa_stations_schema.sql
if errorlevel 1 (
    echo X Schema initialization failed
    pause
    exit /b 1
)
echo OK Schema initialization completed
echo.

echo ============================================================
echo Database setup completed!
echo ============================================================
echo.
echo Next step: python scripts\import_epa_stations.py
echo.
pause