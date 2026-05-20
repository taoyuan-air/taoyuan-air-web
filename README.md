# Taoyuan Air

Taoyuan Air 是桃園空氣品質監測與視覺化專案。專案目前拆成 Next.js 網頁版、Expo/React Native app 版，以及共用的 `shared/` 資料層，讓網頁與手機 app 可以共用 API、型別、store 與常數資料。

## 專案結構

```text
taoyuan-air/
├─ frontend-web/      # Next.js + React，主要網頁版
├─ frontend-mobile/   # Expo + React Native，手機 app 版
├─ shared/            # 共用 API、types、store、constants
├─ database/          # 資料庫相關檔案
├─ data/              # 原始與處理後資料
├─ scripts/           # 資料轉換、資料庫輔助腳本
├─ docs/              # 專案文件
└─ docker-compose.yml # PostgreSQL/PostGIS/Redis 開發環境
```

## 技術棧

- Web：Next.js 16、React 19、TypeScript
- Mobile：Expo 54、React Native 0.81、TypeScript
- Shared：TypeScript、Zustand、共用 API/mock data/types
- Database：PostgreSQL、PostGIS、Redis
- Maps/Data：Leaflet、TGOS、Windy、MOENV、CWA

## 需求

- Node.js 18+
- npm
- Docker Desktop
- Expo Go app，若要用實機測試 mobile app

## 環境變數

Root `.env` 用於資料庫：

```bash
cp .env.example .env
```

內容範例：

```env
POSTGRES_USER=your_username
POSTGRES_PASSWORD=your_password
POSTGRES_DB=taoyuan_air
```

Web 使用 `frontend-web/.env.local`：

```env
NEXT_PUBLIC_MOE_API_KEY=
NEXT_PUBLIC_CWA_API_KEY=
NEXT_PUBLIC_WINDY_API_KEY=
NEXT_PUBLIC_TGOS_API_KEY=
```

Mobile 使用 `frontend-mobile/.env`：

```bash
cp frontend-mobile/.env.example frontend-mobile/.env
```

內容範例：

```env
EXPO_PUBLIC_MOE_API_KEY=your_api_key_here
EXPO_PUBLIC_WINDY_API_KEY=your_windy_api_key_here
EXPO_PUBLIC_CWA_API_KEY=your_cwa_api_key_here
EXPO_PUBLIC_TGOS_API_KEY=your_TGOS_api_key_here
```

## 安裝

目前各前端有自己的 `package.json` 與 lockfile：

```bash
npm install --prefix frontend-web
npm install --prefix frontend-mobile
```

Root 也有簡單啟動 script：

```bash
npm install
```

## 啟動

啟動網頁版：

在 repo root 執行：

```bash
npm run web
```

或同樣在 repo root：

```bash
npm run dev --prefix frontend-web
```

如果你已經在 `frontend-web/` 資料夾內：

```bash
npm run dev
```

啟動 mobile app：

在 repo root 執行：

```bash
npm run mobile
```

或同樣在 repo root：

```bash
npm run start --prefix frontend-mobile
```

如果你已經在 `frontend-mobile/` 資料夾內：

```bash
npm run start
```

Expo 開啟後可以用 Expo Go 掃描 QR code，或執行：

從 repo root：

```bash
npm run android --prefix frontend-mobile
npm run ios --prefix frontend-mobile
```

如果你已經在 `frontend-mobile/` 資料夾內：

```bash
npm run android
npm run ios
```

## 資料庫

啟動 PostgreSQL/PostGIS/Redis：

```bash
docker-compose up -d
docker-compose ps
```

常用腳本：

```bash
scripts\check_db.bat
scripts\backup_db.bat
scripts\restore_db.bat
scripts\setup_epa_db.bat
```

停止服務：

```bash
docker-compose down
```

若要連 volume 一起清掉：

```bash
docker-compose down -v
```

## Shared 層

`shared/` 是 web 與 mobile 共用資料層，包含：

- `shared/src/api/`：MOENV/mock grid/events/alerts API
- `shared/src/types/`：共用 TypeScript 型別
- `shared/src/store/`：Zustand store
- `shared/src/constants/`：主題、行政區、測站對照

`frontend-web` 透過 `@shared/*` alias 使用 shared。`frontend-mobile` 透過 `src/api`、`src/store`、`src/types` wrapper 轉接到 shared，並由 `frontend-mobile/metro.config.js` 讓 Expo/Metro 正確解析 repo 外的 shared 目錄。

## 驗證

建議改動 shared 或前端後執行：

```bash
npx tsc --noEmit -p shared/tsconfig.json
npx tsc --noEmit -p frontend-mobile/tsconfig.json
npm run build --prefix frontend-web
```

若你已經在 `frontend-web/` 資料夾內，build 指令改用：

```bash
npm run build
```

若仍需要驗證 Expo web fallback：

```bash
npm run build:web --prefix frontend-mobile
```

目前 `frontend-web` 的 lint 還有既有規則問題需要後續整理，但 Next.js build 可正常通過。

## 文件

更多設計與規劃文件在 `docs/`：

- `docs/GET_STARTED.md`
- `docs/API_DATABASE_DESIGN.md`
- `docs/DATA_SOURCES.md`
- `docs/FRONTEND_CLEANUP_AUDIT.md`
- `docs/DEVELOPMENT_ROADMAP.md`
