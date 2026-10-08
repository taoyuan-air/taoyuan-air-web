from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    FRONTEND_URL: str = "http://localhost:3000"

    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"
    COOKIE_PATH: str = "/"

    NAQO_SUPABASE_URL: Optional[str] = None
    NAQO_SUPABASE_ANON_KEY: Optional[str] = None
    NAQO_SUPABASE_TABLE: str = "min60"
    NAQO_DEFAULT_DATA_TYPE: str = "min60"
    NAQO_TZ_WORKAROUND: bool = True

    CWA_API_KEY: Optional[str] = None
    MOE_API_KEY: Optional[str] = None

    class Config:
        env_file = ".env"


settings = Settings()
