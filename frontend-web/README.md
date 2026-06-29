# Taoyuan Air Web

`frontend-web/` 是 Taoyuan Air 的主要網頁版前端，使用 Next.js App Router、React、TypeScript 開發。此版本負責桌面與行動瀏覽器的網頁體驗，並透過 `shared/` 共用資料模型、API、store 與常數。

> **Web 前端操作請以本文件為準。**
> 根目錄 `README.md` 只提供整個專案的快速啟動方式；
> `TaoyuanAir登入功能指南與其他更新.md` 只保留登入功能與資料庫遷移紀錄。

## 目前狀態（2026-06-23）

### 數據檢索

| 資料來源 | 前端讀取方式 | 目前狀態 |
| --- | --- | --- |
| 環境部 MOE | `/api/moe` 即時 API，固定六站：桃園、中壢、平鎮、龍潭、大園、觀音 | 已串接；需要 `NEXT_PUBLIC_MOE_API_KEY` |
| 氣象署 CWA | `/api/cwa?district=<行政區>` 即時 API | 已串接；需要 `NEXT_PUBLIC_CWA_API_KEY`，未設定時顯示模擬資料 |
| 桃園市環保局 TYDEP | FastAPI `/api/explorer/history` 歷史資料 | 已串接；資料來源為 PostgreSQL，由 `backend/` FastAPI 提供 |
| 微感測器 | 前端模擬資料 | 資料庫尚未建立，暫時保留假資料 |

MOE 與 CWA route 已統一回傳格式：

```ts
{
  data: 實際資料,
  isFallback: boolean
}
```

兩者皆使用一小時 server-side cache，回應標頭會包含：

```text
X-Cache: HIT
X-Cache: MISS
```

### Data Explorer 時間分頁

`/explorer` 頁面提供三個時間分頁：

| 分頁 | 資料來源 |
| --- | --- |
| 近24小時 | 僅顯示即時 API 資料（MOE/CWA），TYDEP 不顯示 |
| 近3天 | 查詢 DB 歷史（FastAPI `?days=3`），MOE/CWA 有即時資料時優先即時，API 失敗才 fallback DB |
| 近7天 | 查詢 DB 歷史（FastAPI `?days=7`），同上 |

Backend FastAPI 需同時運行（預設 `http://localhost:8001`），Next.js 的 `next.config.ts` 已設定 rewrite 將 `/api/explorer/*` 代理至 FastAPI。

### 原始資料（data/raw/）

本 repo 追蹤以下經過過濾的原始資料（2025 年至今，僅桃園相關）：

| 目錄 | 內容 | 大小 |
| --- | --- | --- |
| `data/raw/cwa-stations/` | CWA 氣象署有人站/自動站/農業站月報（Package_24780/24781/24937） | ~69 MB |
| `data/raw/moe-stations/` | MOE 環境部六站小時值（CSV/JSON） | ~95 MB |
| `data/raw/tydep-stations/` | 桃園市環保局監測數據（108–115 年 Excel） | ~25 MB |
| `data/raw/WindLidar/` | 風光達 TMA_328 日檔（2026-03-27 至 2026-04-15） | ~136 MB |

原始完整資料（7 GB+）另存雲端，不放入 repo。過濾腳本位於 `scripts/filter_cwa_taoyuan.py` 與 `scripts/filter_moe_stations.py`。

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
NEXT_PUBLIC_MOE_API_KEY=
NEXT_PUBLIC_CWA_API_KEY=
NEXT_PUBLIC_WINDY_API_KEY=
NEXT_PUBLIC_TGOS_API_KEY=
```

可從範例檔建立：

```bash
cp frontend-web/.env.example frontend-web/.env.local
```

修改環境變數後必須重新啟動 Next.js，開發服務才會讀到新設定。

用途：

- `NEXT_PUBLIC_MOE_API_KEY`：環境部空氣品質 API
- `NEXT_PUBLIC_CWA_API_KEY`：中央氣象署 API
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

### 目前驗證狀態

- Data Explorer、MOE/CWA route、Dashboard 的 ESLint 已通過。
- `git diff --check` 已通過。
- `/dashboard`、`/explorer`、`/api/moe`、`/api/cwa` 本機回應皆為 HTTP 200。
- `/api/explorer/history?days=3` 與 `?days=7` 由 FastAPI 回傳 200 並提供 `latestAt` 欄位。
- MOE/CWA 第二次請求可取得 `X-Cache: HIT`。
- `frontend-web/src/proxy.ts` 已取代 `middleware.ts`，Next.js 16 可正確辨識 `proxy` export。
- 全專案 TypeScript 檢查仍受既有 UAV 圖表問題影響：
  `UAVProfileChart.tsx` 目前找不到 `recharts` module/type。

上述 UAV 圖表問題不屬於本次 Data Explorer 修改，但正式 build 前仍需處理。

## 注意事項

- `frontend-web` 是目前主要網頁版，不建議再把新網頁功能加回 `frontend-mobile` 的 Expo web 路線。
- `public/` 內若有 create-next-app 預設 SVG 且未被引用，可以依 `docs/FRONTEND_CLEANUP_AUDIT.md` 清理。
- 地圖元件需在 client side 執行，因此 `map/page.tsx` 使用 dynamic import 並關閉 SSR。
