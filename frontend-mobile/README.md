# Taoyuan Air Mobile

`frontend-mobile/` 是 Taoyuan Air 的 Expo/React Native app。它保留原本 app 的畫面與互動，並透過 wrapper 接到 repo root 的 `shared/`，讓 mobile app 和 Next.js web 共用 API、store、types 與部分常數資料。

## 技術棧

- Expo 54
- React Native 0.81
- React 19
- TypeScript
- React Navigation
- Zustand
- react-native-maps
- Leaflet/TGOS/Windy，用於保留 Expo web fallback

## 目錄結構

```text
frontend-mobile/
├─ App.tsx
├─ app.json
├─ metro.config.js
├─ src/
│  ├─ api/             # shared API wrapper
│  ├─ store/           # shared store wrapper
│  ├─ types/           # shared types wrapper
│  ├─ styles/          # React Native UI styles/theme
│  ├─ navigation/      # mobile/web responsive navigation
│  ├─ screens/         # app screens
│  └─ components/      # React Native components
├─ public/             # Expo web template
└─ package.json
```

## Shared 層

Mobile 端目前保留舊 import 路徑，但實際資料來源已轉到 `shared/`：

```ts
// frontend-mobile/src/api/index.ts
export * from '../../../shared/src/api';

// frontend-mobile/src/store/index.ts
export * from '../../../shared/src/store';

// frontend-mobile/src/types/index.ts
export * from '../../../shared/src/types';
```

因此既有畫面仍可使用：

```ts
import { getGrid } from '../api';
import { useStore } from '../store';
import { GridCell } from '../types';
```

`metro.config.js` 會讓 Expo/Metro 監看 `../shared`，並從 app 或 root 的 `node_modules` 解析 shared 依賴。這個檔案不要刪。

## 環境變數

建立 `frontend-mobile/.env`：

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

用途：

- `EXPO_PUBLIC_MOE_API_KEY`：環境部空氣品質 API
- `EXPO_PUBLIC_WINDY_API_KEY`：Windy 地圖圖層
- `EXPO_PUBLIC_CWA_API_KEY`：中央氣象署 API
- `EXPO_PUBLIC_TGOS_API_KEY`：TGOS 地圖

## 安裝

從 repo root：

```bash
npm install --prefix frontend-mobile
```

或進入資料夾：

```bash
cd frontend-mobile
npm install
```

## 開發

從 repo root 啟動 Expo：

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

啟動後可用 Expo Go 掃描 QR code。

直接開 Android/iOS：

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

## Expo Web Fallback

目前 app 仍保留 Expo web 路線，主要用於回歸測試或比較舊畫面：

從 repo root：

```bash
npm run web --prefix frontend-mobile
npm run build:web --prefix frontend-mobile
```

如果你已經在 `frontend-mobile/` 資料夾內：

```bash
npm run web
npm run build:web
```

如果未來確定網頁只使用 `frontend-web/`，可以再依 `docs/FRONTEND_CLEANUP_AUDIT.md` 清理：

- `vercel.json`
- `.vercelignore`
- `public/index.html`
- `public/manifest.json`
- `.web.tsx` screens/components
- `web` / `build:web` scripts

## 型別檢查

```bash
npx tsc --noEmit -p frontend-mobile/tsconfig.json
```

若改到 shared，也建議跑：

```bash
npx tsc --noEmit -p ../shared/tsconfig.json
```

從 repo root 則是：

```bash
npx tsc --noEmit -p shared/tsconfig.json
npx tsc --noEmit -p frontend-mobile/tsconfig.json
```

## 注意事項

- `src/api`、`src/store`、`src/types` 是 shared wrapper，不是重複資料層。
- `src/styles` 仍保留 React Native 專用主題與樣式，因為 mobile component 使用 React Native style object。
- `*.web.tsx` 是 Expo web 平台特化檔。只要還需要 Expo web fallback，就不要刪。
- 新的網頁功能應優先放在 `frontend-web/`；新的 app 功能放在 `frontend-mobile/`。
