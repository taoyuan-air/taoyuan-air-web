import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, Cookie, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from ..database import get_db
from ..models.user import User, RefreshToken
from ..schemas.user import UserRegister, UserLogin, UserPublic, TokenResponse
from ..core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, hash_token,
)
from ..config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

# 暫時關閉安全加密（適用於本機 http 開發）
COOKIE_OPTS = dict(httponly=True, samesite="lax", secure=False)
# COOKIE_OPTS = dict(httponly=True, samesite="lax", secure=True)

@router.post("/register", response_model=UserPublic, status_code=201)
async def register(body: UserRegister, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="此電子郵件已被使用")

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        age_range=body.age_range,
        gender=body.gender,
        default_district=body.default_district,
        sensitivity=body.sensitivity,
        has_respiratory=body.has_respiratory,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="電子郵件或密碼錯誤")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="帳號已停用")

    access_token = create_access_token(str(user.id))
    raw_refresh, refresh_hash, expires = create_refresh_token()

    db.add(RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=expires,
    ))

    response.set_cookie("access_token", access_token, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, **COOKIE_OPTS)
    response.set_cookie("refresh_token", raw_refresh, max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, **COOKIE_OPTS)

    return {"access_token": access_token}


@router.post("/refresh", response_model=TokenResponse)
async def refresh(response: Response, refresh_token: str = Cookie(default=None), db: AsyncSession = Depends(get_db)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="無 Refresh Token")

    token_hash = hash_token(refresh_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    db_token = result.scalar_one_or_none()
    if not db_token:
        raise HTTPException(status_code=401, detail="Refresh Token 無效或已過期")

    db_token.revoked = True
    raw_refresh, refresh_hash, expires = create_refresh_token()
    db.add(RefreshToken(user_id=db_token.user_id, token_hash=refresh_hash, expires_at=expires))

    access_token = create_access_token(str(db_token.user_id))
    response.set_cookie("access_token", access_token, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, **COOKIE_OPTS)
    response.set_cookie("refresh_token", raw_refresh, max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, **COOKIE_OPTS)

    return {"access_token": access_token}


@router.post("/logout")
async def logout(response: Response, refresh_token: str = Cookie(default=None), db: AsyncSession = Depends(get_db)):
    if refresh_token:
        token_hash = hash_token(refresh_token)
        await db.execute(delete(RefreshToken).where(RefreshToken.token_hash == token_hash))

    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "已登出"}


@router.get("/me", response_model=UserPublic)
async def me(access_token: str = Cookie(default=None), db: AsyncSession = Depends(get_db)):
    from ..core.deps import get_current_user
    user = await get_current_user(access_token=access_token, db=db)
    return user
