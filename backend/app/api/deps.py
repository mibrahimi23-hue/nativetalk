"""
FastAPI dependencies shared across endpoints.

Usage in an endpoint:
    from app.api.deps import get_current_user, require_role
    def my_endpoint(user: User = Depends(get_current_user)): ...
    def admin_only(user: User = Depends(require_role("admin"))): ...
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.users import User
from app.services.users import is_jti_blacklisted

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """
    Validate JWT bearer token and return the authenticated User.

    React Native attaches the token as:
        headers: { Authorization: `Bearer ${accessToken}` }

    Raises 401 if token is missing, expired, revoked, or user is inactive.
    """
    if not creds:
        raise HTTPException(
            status_code=401,
            detail="Authorization header missing. "
                   "Send: Authorization: Bearer <access_token>",
        )

    try:
        payload = decode_access_token(creds.credentials)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc

    jti = payload.get("jti")
    if jti and is_jti_blacklisted(db, jti):
        raise HTTPException(status_code=401, detail="Token has been revoked.")

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or deactivated.")

    return user


def require_role(*roles: str):
    """
    Dependency factory that restricts an endpoint to users with a specific role.

    Example:
        @router.get("/admin-only")
        def admin(user: User = Depends(require_role("admin"))): ...
    """
    def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required role(s): {', '.join(roles)}.",
            )
        return user
    return _check
