## 快速開始

### 📋 環境需求

- **Node.js 18+**
- **Docker Desktop** (用於資料庫)
- **npm** 或 **yarn**
- **手機** 或 **模擬器**

### 📱 手機準備

在手機上安裝 **Expo Go** 應用程式：

- [iOS App Store](https://apps.apple.com/app/expo-go/id982107779)
- [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

### 💻 安裝與運行

#### 1. 啟動資料庫服務

```bash
# 啟動 PostgreSQL + PostGIS + Redis
docker-compose up -d

# 檢查服務狀態
docker-compose ps

# 檢查資料庫（可選）
scripts\check_db.bat
```

#### 2. 啟動前端應用

```bash
# 進入前端目錄
cd frontend

# 安裝依賴
npm install

# 啟動開發伺服器
npm start

# 或使用模擬器
npm run ios      # iOS 模擬器 (僅限 Mac)
npm run android  # Android 模擬器
npm run web      # 網頁版 (開發測試用)
```

使用 Expo Go 掃描終端機中的 QR 碼即可在手機上運行。

## 🛠 技術架構

### 主要技術棧

```json
{
  "前端": "React Native + Expo",
  "語言": "TypeScript",
  "資料庫": "PostgreSQL 15 + PostGIS 3.3",
  "快取": "Redis 7",
  "容器化": "Docker + Docker Compose"
}
```

### 資料庫架構

- **PostgreSQL 15** - 主要資料庫
- **PostGIS 3.3** - 空間資料擴充功能
- **Redis 7** - 快取層
- **Docker Volume** - 資料持久化

## 🗄️ 資料庫管理

### 連線資訊

```bash
Host: localhost
Port: 5432
Database: taoyuan_air
User: taoyuan_user
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

# 停止服務
docker-compose down

# 停止並刪除資料（危險！）
docker-compose down -v
```
