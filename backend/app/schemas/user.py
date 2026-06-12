from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator
import uuid


class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str
    password_confirm: str
    age_range: Optional[str] = None
    gender: Optional[str] = None
    default_district: Optional[str] = None
    sensitivity: str = "一般民眾"
    has_respiratory: bool = False

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("密碼至少需要 8 個字元")
        return v

    @field_validator("password_confirm")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("兩次密碼輸入不一致")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    age_range: Optional[str]
    gender: Optional[str]
    default_district: Optional[str]
    sensitivity: str
    has_respiratory: bool
    two_factor_enabled: bool
    notif_pm25: bool
    notif_aqi: bool
    notif_health: bool
    notif_system: bool
    created_at: datetime
    password_changed_at: datetime

    model_config = {"from_attributes": True}


class UserUpdateSecurity(BaseModel):
    two_factor_enabled: Optional[bool] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

    @field_validator("new_password")
    @classmethod
    def new_password_strength(cls, v: Optional[str]) -> Optional[str]:
        if v and len(v) < 8:
            raise ValueError("新密碼至少需要 8 個字元")
        return v


class UserUpdateHealth(BaseModel):
    age_range: Optional[str] = None
    gender: Optional[str] = None
    default_district: Optional[str] = None
    sensitivity: Optional[str] = None
    has_respiratory: Optional[bool] = None


class UserUpdateNotifications(BaseModel):
    notif_pm25: Optional[bool] = None
    notif_aqi: Optional[bool] = None
    notif_health: Optional[bool] = None
    notif_system: Optional[bool] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
