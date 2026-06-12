from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User
from ..schemas.user import (
    UserPublic, UserUpdateSecurity, UserUpdateHealth, UserUpdateNotifications
)
from ..core.deps import get_current_user
from ..core.security import verify_password, hash_password

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me/security", response_model=UserPublic)
async def update_security(
    body: UserUpdateSecurity,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.two_factor_enabled is not None:
        current_user.two_factor_enabled = body.two_factor_enabled

    if body.new_password:
        if not body.current_password:
            raise HTTPException(status_code=400, detail="請提供目前密碼")
        if not verify_password(body.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="目前密碼不正確")
        current_user.hashed_password = hash_password(body.new_password)
        current_user.password_changed_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.patch("/me/health", response_model=UserPublic)
async def update_health(
    body: UserUpdateHealth,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(current_user, field, value)
    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.patch("/me/notifications", response_model=UserPublic)
async def update_notifications(
    body: UserUpdateNotifications,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(current_user, field, value)
    await db.flush()
    await db.refresh(current_user)
    return current_user
