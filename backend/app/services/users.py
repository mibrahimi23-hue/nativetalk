"""
User orchestration service — upsert, fetch, and role-profile helpers.
Keeps DB operations out of endpoint handlers.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    create_refresh_token_value,
    hash_password,
    sha256_hex,
)
from app.core.config import get_settings
from app.models.users import BlacklistedToken, RefreshToken, User

settings = get_settings()


def upsert_google_user(
    db: Session,
    *,
    google_sub: str,
    email: str,
    full_name: str,
    picture: Optional[str] = None,
    role: Optional[str] = None,
) -> User:
    """
    Find an existing user by google_id or email; create one if not found.
    Never overwrites password_hash so email+password accounts remain valid.

    The optional *role* parameter is honoured only when creating a brand-new
    user. Existing users always keep their stored role to avoid privilege
    changes on sign-in.
    """
    user = db.query(User).filter(User.google_id == google_sub).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()

    if user:
        # Update Google-sourced fields that may have changed
        user.google_id = google_sub
        if picture and not user.profile_photo:
            user.profile_photo = picture
        db.commit()
        db.refresh(user)
        return user

    new_role = role if role in {"student", "teacher"} else "student"

    user = User(
        email=email,
        full_name=full_name,
        password_hash=hash_password(create_refresh_token_value()),
        role=new_role,
        google_id=google_sub,
        profile_photo=picture,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def issue_tokens(db: Session, user: User) -> Tuple[str, str]:
    """
    Create a new access + refresh token pair for *user*.
    Stores refresh token hash in DB.
    Returns (access_token, refresh_token_raw).
    """
    access_token  = create_access_token(str(user.id), user.role)
    refresh_raw   = create_refresh_token_value()
    expires_at    = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TTL_DAYS)

    db.add(RefreshToken(
        user_id    = user.id,
        token_hash = sha256_hex(refresh_raw),
        expires_at = expires_at,
    ))
    db.commit()
    return access_token, refresh_raw


def rotate_refresh_token(db: Session, refresh_raw: str) -> Tuple[User, str, str]:
    """
    Validate and rotate a refresh token.
    Returns (user, new_access_token, new_refresh_token).
    Raises ValueError on invalid / expired token.
    """
    stored = db.query(RefreshToken).filter(
        RefreshToken.token_hash == sha256_hex(refresh_raw),
        RefreshToken.expires_at  > datetime.now(timezone.utc),
    ).first()
    if not stored:
        raise ValueError("Invalid or expired refresh token.")

    user = db.query(User).filter(User.id == stored.user_id, User.is_active == True).first()
    if not user:
        raise ValueError("User not found or deactivated.")

    # Rotate: delete old, issue new
    db.delete(stored)
    db.commit()

    access_token, new_refresh = issue_tokens(db, user)
    return user, access_token, new_refresh


def blacklist_jti(db: Session, jti: str, expires_at: datetime) -> None:
    """Add a JTI to the blacklist (called on logout)."""
    if not db.query(BlacklistedToken).filter(BlacklistedToken.jti == jti).first():
        db.add(BlacklistedToken(jti=jti, expires_at=expires_at))
        db.commit()


def is_jti_blacklisted(db: Session, jti: str) -> bool:
    return db.query(BlacklistedToken).filter(BlacklistedToken.jti == jti).first() is not None
