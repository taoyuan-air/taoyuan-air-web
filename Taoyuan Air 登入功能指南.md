---
title: Taoyuan Air 登入功能完整設置指南

---


# 完整操作指南

## 目錄
1. 最終資料夾結構
2. 步驟一：安裝依賴
3. 步驟二：資料庫腳本
4. 步驟三：啟動與測試

---

## 1. 最終資料夾結構

```
taoyuan-air/
├── backend/                          ← 全新建立
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   └── user.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   └── user.py
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   └── user.py
│   │   └── core/
│   │       ├── __init__.py
│   │       ├── security.py
│   │       └── deps.py
│   ├── requirements.txt
│   └── .env                          ← 自行建立
│
├── database/
│   └── auth_schema.sql               ← 新增
│
├── frontend-web/
│   └── src/
│       ├── app/
│       │   ├── (auth)/               ← 新增 route group
│       │   │   ├── login/
│       │   │   │   └── page.tsx      ← 新增
│       │   │   └── register/
│       │   │       └── page.tsx      ← 新增
│       │   ├── settings/
│       │   │   └── page.tsx          ← 修改
│       │   └── layout.tsx            ← 修改
│       ├── lib/                      ← 新增
│       │   ├── auth-context.tsx
│       │   ├── api-client.ts
│       │   └── auth-utils.ts
│       └── middleware.ts             ← 新增（專案根層 src/）
```

---

## 2. 步驟一：安裝依賴

### 2-1 建立 backend 目錄並安裝 Python 套件

```bash
mkdir -p backend/app/models backend/app/schemas backend/app/routers backend/app/core
```

**`backend/requirements.txt`** 內容：

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
sqlalchemy==2.0.36
asyncpg==0.30.0
alembic==1.14.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.12
pydantic[email]==2.10.3
pydantic-settings==2.6.1
python-dotenv==1.0.1
httpx==0.28.1
```

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 2-2 前端不需要額外安裝（只用現有的 fetch API）

---

## 3. 步驟二：資料庫腳本

### `database/auth_schema.sql`

```sql
-- 使用者帳號表
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username            VARCHAR(50) NOT NULL,
    email               VARCHAR(255) NOT NULL UNIQUE,
    hashed_password     TEXT NOT NULL,
    age_range           VARCHAR(20),
    gender              VARCHAR(10),
    default_district    VARCHAR(20),
    sensitivity         VARCHAR(20) DEFAULT '一般民眾',
    has_respiratory     BOOLEAN DEFAULT FALSE,
    two_factor_enabled  BOOLEAN DEFAULT FALSE,
    notif_pm25          BOOLEAN DEFAULT TRUE,
    notif_aqi           BOOLEAN DEFAULT TRUE,
    notif_health        BOOLEAN DEFAULT FALSE,
    notif_system        BOOLEAN DEFAULT TRUE,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    password_changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Refresh Token 表
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    revoked     BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

執行方式：

```bash
# 確保 docker-compose 已啟動
docker-compose up -d

# 執行 SQL
docker exec -i taoyuan-air-db psql -U <你的POSTGRES_USER> -d taoyuan_air < database/auth_schema.sql
```

---

## 4. 步驟三：FastAPI 後端

### `backend/.env`（自行建立）

```env
DATABASE_URL=postgresql+asyncpg://你的USER:你的PASSWORD@localhost:5432/taoyuan_air
SECRET_KEY=請換成一個至少64字元的隨機字串
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
FRONTEND_URL=http://localhost:3000
```

產生隨機 SECRET_KEY：

```bash
python -c "import secrets; print(secrets.token_hex(64))"
```


---

## 4. 步驟三：啟動與測試

### 啟動順序

```bash
# 1. 啟動資料庫
docker-compose up -d

# 2. 執行 auth schema
docker exec -i taoyuan-air-db psql -U <USER> -d taoyuan_air < database/auth_schema.sql

# 3. 啟動 FastAPI 後端
cd backend
source venv/bin/activate  # 或 Windows: venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 4. 啟動 Next.js（另開 terminal）
cd frontend-web
npm run dev
```

### 驗證 API 正常運作

```bash
# 健康檢查
curl http://localhost:8000/health

# 查看 API 文件
open http://localhost:8000/docs
```

### 安全測試（在瀏覽器）

```
1. 直接前往 http://localhost:3000/map  → 應跳轉到 /auth/login
2. 直接前往 http://localhost:3000/dashboard → 應正常顯示（訪客可看）
3. 輸入錯誤密碼登入 → 應顯示「電子郵件或密碼錯誤」
4. 正確登入後前往 /map → 應正常顯示
5. 在 Settings 修改通知偏好，儲存後登出再登入 → 設定應保留
6. 在 Settings 修改密碼，用新密碼重新登入 → 應成功
```

---

## 常見問題

**Q: CORS 錯誤**
確認 `backend/.env` 的 `FRONTEND_URL=http://localhost:3000`，且 FastAPI 已正確 reload。

**Q: Cookie 無法設定（SameSite 問題）**
開發環境使用 `http`，確認 `COOKIE_OPTS` 中 `secure=False`。

**Q: `asyncpg` 連線失敗**
確認 `DATABASE_URL` 格式為 `postgresql+asyncpg://user:pass@localhost:5432/taoyuan_air`，Docker 容器需已啟動。

**Q: Next.js middleware 不生效**
`middleware.ts` 必須放在 `frontend-web/src/middleware.ts`（不是 `app/` 內），且 `next.config.ts` 不需要額外設定。