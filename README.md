## 專案結構

```text
taoyuan-air/
├─ frontend-web/       # Next.js + React，桌面版與網頁版儀表板
├─ frontend-mobile/    # Expo + React Native，手機 App
├─ shared/             # 共用 API、types、store、constants
├─ database/           # 資料庫 schema 與初始化相關檔案
├─ data/               # 原始資料與匯入資料
├─ scripts/            # 資料庫檢查、備份、匯入與轉換工具
├─ docs/               # 專案文件與資料來源說明
└─ docker-compose.yml  # PostgreSQL + PostGIS + Redis
```

## 快速開始

### 環境需求

- **Node.js 18+**
- **Docker Desktop** (用於資料庫)
- **npm**
- **手機** 或 **模擬器** (用於 Mobile App)

### 手機準備

在手機上安裝 **Expo Go** 應用程式：

- [iOS App Store](https://apps.apple.com/app/expo-go/id982107779)
- [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

### 安裝與運行

#### 1. 環境配置

```bash
# 複製資料庫環境變數
cp .env.example .env

# 複製 Mobile 環境變數
cp frontend-mobile/.env.example frontend-mobile/.env
```

Web 端使用 `frontend-web/.env.local`。如果尚未建立，可依照 `frontend-web/.env.example` 新增：

```bash
cp frontend-web/.env.example frontend-web/.env.local
```

編輯環境變數檔案：

```env
# .env
POSTGRES_USER=your_username
POSTGRES_PASSWORD=your_password
POSTGRES_DB=taoyuan_air
```

```env
# frontend-web/.env.local
NEXT_PUBLIC_MOE_API_KEY=your_moe_api_key_here
NEXT_PUBLIC_WINDY_API_KEY=your_windy_api_key_here
NEXT_PUBLIC_TGOS_API_KEY=your_tgos_api_key_here
```

```env
# frontend-mobile/.env
EXPO_PUBLIC_MOE_API_KEY=your_api_key_here
EXPO_PUBLIC_WINDY_API_KEY=your_windy_api_key_here
EXPO_PUBLIC_CWA_API_KEY=your_cwa_api_key_here
EXPO_PUBLIC_TGOS_API_KEY=your_TGOS_api_key_here
```

#### 2. 安裝依賴

```bash
# 安裝 root scripts 依賴
npm install

# 安裝 Web 端依賴
npm install --prefix frontend-web

# 安裝 Mobile 端依賴
npm install --prefix frontend-mobile
```

#### 3. 啟動資料庫服務

```bash
# 啟動 PostgreSQL + PostGIS + Redis
docker-compose up -d

# 檢查服務狀態
docker-compose ps

# 檢查資料庫（可選）
scripts\check_db.bat
```

#### 4. 啟動 Web 應用

在 repo root 執行：

```bash
npm run web
```

或進入 Web 目錄執行：

```bash
cd frontend-web
npm run dev
```

預設會啟動 Next.js 開發伺服器，通常位於 `http://localhost:3000`。

#### 5. 啟動 Mobile App

在 repo root 執行：

```bash
npm run mobile
```

或進入 Mobile 目錄執行：

```bash
cd frontend-mobile
npm run start
```

使用 Expo Go 掃描終端機中的 QR code 即可在手機上運行。

也可以使用模擬器：

```bash
npm run android --prefix frontend-mobile
npm run ios --prefix frontend-mobile
npm run web --prefix frontend-mobile
```

## 技術架構

### 重構後模組

- **frontend-web/** - Next.js Web 端，包含空氣總覽、監測地圖、資料檢索、事件記錄、警報通知與設定頁面。
- **frontend-mobile/** - Expo / React Native 手機端，保留行動裝置瀏覽與 Expo Go 測試流程。
- **shared/** - Web 與 Mobile 共用的 API client、mock data、types、store 與 constants。

### Shared 使用方式

`shared/` 集中放置跨平台邏輯：

- `shared/src/api/` - MOE、CWA、TYDEP、事件與警報相關 API / mock data
- `shared/src/types/` - 共用 TypeScript 型別
- `shared/src/store/` - Zustand store
- `shared/src/constants/` - 桃園行政區、靜態空品資料與共用常數

`frontend-web` 透過 `@shared/*` alias 引用共用模組。  
`frontend-mobile` 透過 `src/api`、`src/store`、`src/types` wrapper 轉接到 `shared/`，並由 `metro.config.js` 設定 Metro 讀取 repo 內的 shared package。

## 資料庫管理

### 連線資訊

```bash
Host: localhost
Port: 5432
Database: taoyuan_air
User: (見 .env 檔案)
Password: (見 .env 檔案)
```

### 管理指令

```bash
# 備份資料庫
scripts\backup_db.bat

# 還原資料庫
scripts\restore_db.bat [備份檔案路徑]

# 檢查資料庫狀態
scripts\check_db.bat

# 設定 MOE 資料庫
scripts\setup_moe_db.bat

# 設定 TYDEP 資料庫
scripts\setup_tydep_db.bat

# 停止服務
docker-compose down

# 停止並刪除資料（危險！）
docker-compose down -v
```

### 資料匯入與轉換

```bash
# 匯入 MOE 測站
python scripts\import_moe_stations.py

# 匯入 CWA 測站
python scripts\import_cwa_stations.py

# MOE 月資料補正（history 覆蓋 realtime）
python scripts\update_moe_monthly.py

# CWA 月資料補正（history 覆蓋 realtime）
python scripts\update_cwa_monthly.py

# 匯入 TYDEP 測站
python scripts\import_tydep_stations.py

# 匯入 UAV 無人機剖面
python scripts\import_uav.py

# 匯入 WindLidar 風光達
python scripts\import_wind_lidar.py

# 匯入 TEDS 點源資料
python scripts\import_teds_point.py
```

Python 匯入工具的依賴可參考：

```bash
pip install -r scripts\requirements.txt
```

## 檢查與建置

```bash
# 檢查 shared 型別
npx tsc --noEmit -p shared/tsconfig.json

# 檢查 Web 型別
npx tsc --noEmit -p frontend-web/tsconfig.json

# 檢查 Mobile 型別
npx tsc --noEmit -p frontend-mobile/tsconfig.json

# Web lint
npm run lint --prefix frontend-web

# Web build
npm run build --prefix frontend-web

# Mobile web export
npm run build:web --prefix frontend-mobile
```

## 常用開發指令

```bash
# 從 repo root 啟動 Web
npm run web

# 從 repo root 啟動 Mobile
npm run mobile

# 只啟動資料庫
docker-compose up -d

# 查看資料庫服務
docker-compose ps
```
