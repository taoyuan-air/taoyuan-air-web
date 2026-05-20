# Taoyuan Air Web

`frontend-web/` 是 Taoyuan Air 的主要網頁版前端，使用 Next.js App Router、React、TypeScript 開發。此版本負責桌面與行動瀏覽器的網頁體驗，並透過 `shared/` 共用資料模型、API、store 與常數。

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

目前 lint 仍有既有問題待整理，主要是：

- `@typescript-eslint/no-explicit-any`
- React hook dependency warnings
- React static component lint rule

這些不會阻止 `next build`，但建議後續單獨整理。

## 注意事項

- `frontend-web` 是目前主要網頁版，不建議再把新網頁功能加回 `frontend-mobile` 的 Expo web 路線。
- `public/` 內若有 create-next-app 預設 SVG 且未被引用，可以依 `docs/FRONTEND_CLEANUP_AUDIT.md` 清理。
- 地圖元件需在 client side 執行，因此 `map/page.tsx` 使用 dynamic import 並關閉 SSR。
