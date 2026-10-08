# Taoyuan Air Web

`frontend-web/` 是 Taoyuan Air 的主要網頁版前端，使用 Next.js App Router、React、TypeScript 開發。此版本負責桌面與行動瀏覽器的網頁體驗，並透過 `shared/` 共用資料模型、API、store 與常數。

> **Web 前端操作請以本文件為準。**
> 根目錄 `README.md` 只提供整個專案的快速啟動方式；
> `TaoyuanAir登入功能指南與其他更新.md` 只保留登入功能與資料庫遷移紀錄。

## 目前狀態（2026-10-07）

### 數據檢索

| 資料來源 | 前端讀取方式 | 目前狀態 |
| --- | --- | --- |
| 環境部 MOE | FastAPI `/api/moe` 即時 API，固定六站：桃園、中壢、平鎮、龍潭、大園、觀音 | 已串接；需要在 `backend/.env` 設定 `MOE_API_KEY` |
| 氣象署 CWA | FastAPI `/api/cwa?district=<行政區>` 即時 API | 已串接；需要在 `backend/.env` 設定 `CWA_API_KEY`，未設定時顯示模擬資料 |
| 桃園市環保局 TYDEP | FastAPI `/api/explorer/history` 歷史資料 | 已串接；資料來源為 PostgreSQL，由 `backend/` FastAPI 提供 |
| 微感測器 | 前端模擬資料 | 資料庫尚未建立，暫時保留假資料 |

**2026-10-07 變更：** MOE 與 CWA 已從 Next.js route（`src/app/api/moe`、`src/app/api/cwa`）移到後端 FastAPI（`backend/app/routers/moe.py`、`cwa.py`）。
> API 金鑰只放在後端，不再使用 `NEXT_PUBLIC_` 變數，避免金鑰被打包進瀏覽器的 JavaScript


### 原始資料（data/raw/）

本 repo 追蹤以下經過過濾的原始資料（2025 年至今，僅桃園相關）：

| 目錄 | 內容 | 大小 |
| --- | --- | --- |
| `data/raw/cwa-stations/` | CWA 氣象署有人站/自動站/農業站月報（Package_24780/24781/24937） | ~69 MB |
| `data/raw/moe-stations/` | MOE 環境部六站小時值（CSV/JSON） | ~95 MB |
| `data/raw/tydep-stations/` | 桃園市環保局監測數據（108–115 年 Excel） | ~25 MB |
| `data/raw/WindLidar/` | 風光達 TMA_328 日檔（2026-03-27 至 2026-04-15） | ~136 MB |


## 技術棧

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS/PostCSS
- Zustand
- Leaflet、TGOS、Windy map integrations

## 目錄結構

```text
frontend-web/
├─ src/app/                  # Next.js App Router pages/layout
│  ├─ page.tsx               # Root route, re-exports dashboard
│  ├─ dashboard/page.tsx     # Dashboard route
│  ├─ map/page.tsx           # Map
│  ├─ explorer/page.tsx      # Data explorer
│  ├─ events/page.tsx        # Events
│  ├─ alerts/page.tsx        # Alerts
│  ├─ notifications/page.tsx # Notifications
│  └─ settings/page.tsx      # Settings
├─ src/components/
│  ├─ navigation/TopNav.tsx
│  ├─ map/LeafletMap.tsx
│  ├─ map/TGOSMap.tsx
│  └─ charts/PentagonRadar.tsx
├─ public/
├─ next.config.ts
└─ package.json
```

## Shared 層

Web 端透過 TypeScript path alias 使用 shared：

```ts
import { getGrid } from '@shared/api';
import { useStore } from '@shared/store';
import { GridCell } from '@shared/types';
```

相關設定：

- `tsconfig.json`：`@shared/*` 指向 `../shared/src/*`
- `next.config.ts`：`transpilePackages: ['@taoyuan-air/shared']`

## 環境變數

建立 `frontend-web/.env.local`：

```env
NEXT_PUBLIC_API_BASE=/api
BACKEND_ORIGIN=http://127.0.0.1:8001
NEXT_PUBLIC_WINDY_API_KEY=
NEXT_PUBLIC_TGOS_API_KEY=
```

正式環境（虛擬機）額外設定：

```env
NEXT_PUBLIC_BASE_PATH=/tyair
NEXT_PUBLIC_API_BASE=/tyair/api
```

修改環境變數後必須重新啟動 Next.js，開發服務才會讀到新設定。`NEXT_PUBLIC_` 開頭的變數會在 build 時寫進程式，正式環境修改後必須重新 `npm run build`。

用途：

- `NEXT_PUBLIC_API_BASE`：前端呼叫 API 的基底路徑（`src/lib/apiBase.ts` 讀取）。正式環境為 `/tyair/api`；未設定時預設 `/api`。
- `NEXT_PUBLIC_WINDY_API_KEY`：Windy 地圖圖層
- `NEXT_PUBLIC_TGOS_API_KEY`：TGOS 地圖

## 安裝

從 repo root 執行：

```bash
npm install --prefix frontend-web
```

或進入資料夾：

```bash
cd frontend-web
npm install
```

## 開發

從 repo root：

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

預設網址：

```text
http://localhost:3000
```

若 `3000` 已被 Docker 或其他服務使用，可指定其他連接埠：

```bash
npm run dev --prefix frontend-web -- --port 3001
```

此時數據檢索頁為：

```text
http://localhost:3001/explorer
```

## Build

從 repo root：

```bash
npm run build --prefix frontend-web
```

如果你已經在 `frontend-web/` 資料夾內：

```bash
npm run build
```

啟動 production server：

從 repo root：

```bash
npm run start --prefix frontend-web
```

如果你已經在 `frontend-web/` 資料夾內：

```bash
npm run start
```

## Lint

從 repo root：

```bash
npm run lint --prefix frontend-web
```

如果你已經在 `frontend-web/` 資料夾內：

```bash
npm run lint
```

## 注意事項

- `frontend-web` 是目前主要網頁版，不建議再把新網頁功能加回 `frontend-mobile` 的 Expo web 路線。
- `public/` 內若有 create-next-app 預設 SVG 且未被引用，可以依 `docs/FRONTEND_CLEANUP_AUDIT.md` 清理。
- 地圖元件需在 client side 執行，因此 `map/page.tsx` 使用 dynamic import 並關閉 SSR。
