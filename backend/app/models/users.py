from sqlalchemy import Column, String, Boolean, Text, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base

import uuid


class User(Base):
    __tablename__ = "users"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name     = Column(String(200), nullable=False)
    email         = Column(String(255), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    role          = Column(String(50), nullable=False)
    timezone      = Column(String(60), default='UTC')
    location      = Column(String(120), nullable=True)
    profile_photo = Column(Text)
    phone         = Column(String(20), nullable=True)
    google_id     = Column(String(255), unique=True, nullable=True, index=True)
    is_active     = Column(Boolean, default=True)
    is_suspended  = Column(Boolean, default=False)
    created_at    = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at    = Column(TIMESTAMP(timezone=True), server_default=func.now())

    teacher     = relationship("Teacher", back_populates="user", uselist=False)
    student     = relationship("Student", back_populates="user", uselist=False)
    suspensions = relationship("Suspension", back_populates="user")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(Text, nullable=False, unique=True)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False, index=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class BlacklistedToken(Base):
    __tablename__ = "blacklisted_tokens"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jti        = Column(Text, nullable=False, unique=True, index=True)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False, index=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
