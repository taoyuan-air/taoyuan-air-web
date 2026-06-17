import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    hashed_password = Column(Text, nullable=False)
    age_range = Column(String(20))
    gender = Column(String(10))
    default_district = Column(String(20))
    sensitivity = Column(String(20), default="一般民眾")
    has_respiratory = Column(Boolean, default=False)
    has_elderly = Column(Boolean, default=False) 
    has_child = Column(Boolean, default=False)    
    two_factor_enabled = Column(Boolean, default=False)
    notif_pm25 = Column(Boolean, default=True)
    notif_aqi = Column(Boolean, default=True)
    notif_health = Column(Boolean, default=False)
    notif_system = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    password_changed_at = Column(DateTime(timezone=True), server_default=func.now())


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    token_hash = Column(Text, nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked = Column(Boolean, default=False)
