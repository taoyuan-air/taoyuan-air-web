-- 使用者帳號表
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username            VARCHAR(50) NOT NULL,
    email               VARCHAR(255) NOT NULL UNIQUE,
    hashed_password     TEXT NOT NULL,
    birth_date          DATE,
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
    password_changed_at TIMESTAMPTZ DEFAULT NOW(),
    has_elderly         BOOLEAN DEFAULT FALSE,
    has_child           BOOLEAN DEFAULT FALSE
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
