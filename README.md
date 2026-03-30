# 桃園空品專案

本專案整合前端與 EPA 測站資料庫，提供桃園市空氣品質資料的匯入、查詢與展示。

## 快速開始

1. 建立 `.env`（至少要有 `POSTGRES_PASSWORD`）。
2. 執行 `scripts\setup_epa_db.bat` 建立資料庫與套用 schema。
3. 安裝 Python 套件：`pip install -r scripts\requirements.txt`。
4. 執行匯入：`python scripts\import_epa_stations.py`。
5. 啟動前端：
   - `cd frontend`
   - `npm install`
   - `npm start`

## 📋 環境需求

- Node.js 18+
- npm 9+
- Python 3.x
- Docker Desktop（含 Docker Compose）

## 📱 手機準備

- Android：安裝 Expo Go。
- iOS：安裝 Expo Go。
- 手機與開發機需在同一網路。

## 💻 安裝與運行

### 1. 建立環境變數

在專案根目錄建立 `.env`：

```env
POSTGRES_USER=taoyuan_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=taoyuan_air
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

### 2. 建立資料庫

```bat
scripts\setup_epa_db.bat
```

### 3. 匯入 EPA 歷史資料

```bat
pip install -r scripts\requirements.txt
python scripts\import_epa_stations.py
```

### 4. 啟動前端

```bat
cd frontend
npm install
npm start
```

常用前端模式：

- `npm run android`
- `npm run web`

## 🛠 技術架構

- 前端：React Native + Expo
- 資料庫：PostgreSQL 15 + PostGIS 3.3
- 容器化：Docker + Docker Compose
- 資料處理：Python 3.x + psycopg2
- 資料來源：MOENV AQX_P_205~209（桃園 5 站）

## 🗄️ 資料庫管理

### 連線資訊

- Host: `localhost`
- Port: `5432`
- Database: `taoyuan_air`
- User: `taoyuan_user`
- Password: `.env` 內 `POSTGRES_PASSWORD`

### 管理指令

```bat
scripts\check_db.bat
scripts\backup_db.bat
scripts\restore_db.bat [備份檔案路徑]

docker ps
docker logs taoyuan-air-db
docker-compose down
docker-compose down -v
```

資料驗證查詢：

```sql
SELECT COUNT(*) FROM epa_stations;
SELECT COUNT(*) FROM epa_hourly_data;
SELECT * FROM epa_latest_data LIMIT 5;
SELECT * FROM check_epa_data_quality();
```
