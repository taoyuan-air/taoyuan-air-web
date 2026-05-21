# Frontend Cleanup Audit

本文件整理 `frontend-web/` 與 `frontend-mobile/` 目前可疑閒置檔案、框架必要檔案，以及建議清理順序。目標是在保留 Next.js 網頁版與 Expo/React Native app 功能的前提下，逐步移除模板殘留與本機產物。

## 背景

專案目前拆成：

- `frontend-web/`：Next.js + React，作為主要網頁版。
- `frontend-mobile/`：Expo + React Native，作為 app 版。
- `shared/`：共用 API、store、types、constants。

目前 `frontend-mobile` 已透過 wrapper 接到 `shared/src`，`frontend-web` 也使用 `@shared/...`。因此清理時應避免刪除 shared 相容層與 Metro 設定。

## 可清掉的本機產物

這些不是原始碼，通常不該進 git。若只是本機清空，可以安全移除，之後 build/dev server 會重新產生。

### `frontend-web`

- `frontend-web/.next/`
- `frontend-web/node_modules/`

### `frontend-mobile`

- `frontend-mobile/dist/`
- `frontend-mobile/.expo/`
- `frontend-mobile/node_modules/`

備註：這些目錄應由 `.gitignore` 忽略。若之後整理 monorepo，可以把 root `.gitignore` 與各前端 `.gitignore` 的責任再收斂一次。

## `frontend-web` 可疑未使用檔案

### AI 工具輔助檔

- `frontend-web/AGENTS.md`
- `frontend-web/CLAUDE.md`

這兩個檔案不會被 Next.js runtime 或 build 使用。它們主要是給 AI coding agent / Claude 讀取專案規則。若團隊不使用這類工具規則，可以刪除。

目前 `CLAUDE.md` 內容只有：

```text
@AGENTS.md
```

所以若刪 `AGENTS.md`，`CLAUDE.md` 也應一起刪除或改寫。

### 預設 README

- `frontend-web/README.md`

目前內容仍是 create-next-app 預設文字，和 Taoyuan Air 專案關聯不高。建議二選一：

- 改寫成 Taoyuan Air web 的啟動、環境變數、部署說明。
- 若 root README 已涵蓋，可刪除。

### Next.js template SVG

以下檔案目前沒有被 `frontend-web/src` 引用，屬於 create-next-app 模板殘留：

- `frontend-web/public/next.svg`
- `frontend-web/public/vercel.svg`
- `frontend-web/public/file.svg`
- `frontend-web/public/globe.svg`
- `frontend-web/public/window.svg`

若沒有打算在頁面中使用，可以刪除。

## `frontend-mobile` 可疑未使用或舊 web 殘留

這一區要比 `frontend-web` 更謹慎，因為 `frontend-mobile` 仍保留 Expo web 能力。若你確定「網頁只走 Next.js，Expo 只做 native app」，才建議清掉。

### Expo web / Vercel 相關

- `frontend-mobile/vercel.json`
- `frontend-mobile/.vercelignore`
- `frontend-mobile/public/index.html`
- `frontend-mobile/public/manifest.json`
- `frontend-mobile/package.json` 裡的 `web` script
- `frontend-mobile/package.json` 裡的 `build:web` script

目前 `frontend-mobile/app.json` 有設定：

```json
{
  "web": {
    "bundler": "metro",
    "template": "./public/index.html"
  }
}
```

所以只要還需要 `expo start --web` 或 `expo export -p web`，就不要刪 `public/index.html` 與相關 web 設定。

### `.web.tsx` 檔案

這些是 Expo / React Native Web 的平台特化檔案：

- `frontend-mobile/src/screens/DashboardScreen.web.tsx`
- `frontend-mobile/src/screens/EventsScreen.web.tsx`
- `frontend-mobile/src/screens/MapScreen.web.tsx`
- `frontend-mobile/src/components/LeafletMap.web.tsx`
- `frontend-mobile/src/components/TGOSMap.web.tsx`

若未來 mobile 資料夾只負責 iOS/Android，可以再移除。但目前 `ResponsiveNavigator` 仍會引用 web 版畫面，因此不建議立刻刪。

## `frontend-mobile` 目前看起來未被實際使用的元件

以下檔案只查到定義或 export，沒有查到實際畫面 import 使用：

- `frontend-mobile/src/components/HeatGrid.tsx`
- `frontend-mobile/src/components/KpiCard.tsx`
- `frontend-mobile/src/components/WebMap.tsx`
- `frontend-mobile/src/components/BottomSheet.tsx`

注意事項：

- `KpiCard` 有從 `frontend-mobile/src/components/index.ts` export，但沒有看到實際使用。
- `BottomSheet` 名稱容易誤判，因為 `MapScreen` 有自己的 bottom sheet state/UI，但沒有 import 這個 component。
- 建議先確認近期設計稿或功能分支是否打算復用，再刪除。

## 建議保留的檔案

### `frontend-web`

- `frontend-web/next.config.ts`
- `frontend-web/postcss.config.mjs`
- `frontend-web/eslint.config.mjs`
- `frontend-web/tsconfig.json`
- `frontend-web/next-env.d.ts`

`next-env.d.ts` 是 Next.js 產生的型別檔。它可由 Next 重新產生，但保留也很常見。

### `frontend-mobile`

- `frontend-mobile/metro.config.js`
- `frontend-mobile/src/api/index.ts`
- `frontend-mobile/src/api/moe.ts`
- `frontend-mobile/src/store/index.ts`
- `frontend-mobile/src/types/index.ts`

這些是 app 端接到 shared 的必要相容層。`metro.config.js` 也負責讓 Expo/Metro 正確解析 `shared/` 與依賴。

## 建議清理順序

1. 先清 `frontend-web` 的 template SVG。
2. 決定是否保留 `AGENTS.md` / `CLAUDE.md`。若團隊不使用 AI agent 規則，可一起刪除。
3. 改寫或刪除 `frontend-web/README.md`。
4. 等確認不再使用 Expo web 後，再清理 `frontend-mobile` 的 Vercel、public web template、`.web.tsx`。
5. 最後處理 `frontend-mobile` 未使用元件，刪除後跑型別檢查與 bundle 驗證。

## 清理後建議驗證

每次刪除一批檔案後，至少執行：

```bash
npx tsc --noEmit -p shared/tsconfig.json
npx tsc --noEmit -p frontend-mobile/tsconfig.json
npm run build --prefix frontend-web
```

若仍保留 Expo web fallback，再加跑：

```bash
npm run build:web --prefix frontend-mobile
```

目前已知 `frontend-web` 的 `npm run lint` 會因既有 lint 問題失敗，主要包含 `any`、hook dependency、React lint 規則等；這不代表 build 失敗，但後續可以另開任務修 lint。
