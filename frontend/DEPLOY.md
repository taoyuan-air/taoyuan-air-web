# 🚀 Vercel 部署步驟

## 方法：透過 Vercel 網站部署

### 1. 前往 Vercel
訪問 [vercel.com](https://vercel.com) 並登入（使用 GitHub 帳號）

### 2. 匯入專案
- 點擊 "Add New Project"
- 選擇你的 GitHub 儲存庫：`taoyuan-air`
- 選擇分支：`deploy/web-preview`

### 3. 配置設定
- **Framework Preset**: Other
- **Root Directory**: `frontend`
- **Build Command**: `npm run build:web`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### 4. 部署
點擊 "Deploy" 按鈕，等待建置完成

### 5. 獲得網址
部署成功後會得到：`https://taoyuan-air-xxx.vercel.app`

## 🔄 自動部署
每次 push 到 `deploy/web-preview` 分支都會自動重新部署
