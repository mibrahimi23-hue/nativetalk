"""
Authentication endpoints.

─────────────────────────────────────────────────────────────────────────────
React Native integration quick-reference
─────────────────────────────────────────────────────────────────────────────

1. Google Sign-In  (recommended for mobile)
   ─────────────────
   Install: @react-native-google-signin/google-signin
   Configure with WEB_CLIENT_ID = GOOGLE_CLIENT_ID from .env

   const { idToken } = await GoogleSignin.signIn();
   const res = await fetch(`${BASE}/api/v1/auth/google`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id_token: idToken }),
   });
   const { access_token, refresh_token, user } = await res.json();
   // Save both tokens in SecureStore

2. Email / Password register + login  (optional fallback)
   ─────────────────────────────────────
   POST /api/v1/auth/register  { email, password, full_name, role }
   POST /api/v1/auth/login     { email, password }

3. Authenticated requests
   ─────────────────────────
   headers: { Authorization: `Bearer ${accessToken}` }

4. Token refresh  (call when any request returns 401)
   ──────────────────────────────────────────────────
   POST /api/v1/auth/refresh  { refresh_token }

5. Logout
   ──────────────────────────────────────────────────
   POST /api/v1/auth/logout
   headers: { Authorization: `Bearer ${accessToken}` }
─────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

from datetime import datetime, timezone

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import JWTError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import (
    decode_access_token,
    hash_password,
    sha256_hex,
    verify_password,
)
from app.db.session import get_db
from app.models.language import Language
from app.models.student import Student, StudentLanguage
from app.models.teacher import Teacher
from app.models.users import RefreshToken, User
from pydantic import BaseModel, EmailStr

from app.schemas.auth import (
    GoogleLoginRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)


class ResetPasswordRequest(BaseModel):
    email:            EmailStr
    new_password:     str
    confirm_password: str
from app.schemas.user import UserOut
from app.services.google_auth import verify_google_id_token
from app.services.timezone import is_valid_timezone, resolve_student_timezone, timezone_for_language
from app.services.users import (
    blacklist_jti,
    issue_tokens,
    rotate_refresh_token,
    upsert_google_user,
)
import logging

logger = logging.getLogger("nativetalk")

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── Google Sign-In ────────────────────────────────────────────────────────────

@router.post(
    "/google",
    response_model=TokenResponse,
    summary="Sign in with Google ID token",
)
def google_login(body: GoogleLoginRequest, db: Session = Depends(get_db)):
    claims = verify_google_id_token(body.id_token)

    user = upsert_google_user(
        db,
        google_sub=claims["sub"],
        email=claims["email"],
        full_name=claims.get("name", claims["email"].split("@")[0]),
        picture=claims.get("picture"),
        role=body.role,
    )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account has been deactivated.")

    if user.role == "student":
        student = db.query(Student).filter(Student.user_id == user.id).first()
        if not student:
            db.add(Student(user_id=user.id, current_level="A1"))
            db.commit()

    access_token, refresh_token = issue_tokens(db, user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


# ── Email / Password ──────────────────────────────────────────────────────────


@router.get(
    "/email-available",
    summary="Quick lookup so the signup form can show 'already registered' inline",
)
def email_available(email: str, db: Session = Depends(get_db)):
    """
    Lightweight existence check used by the Sign Up screen. Returns
    `{ available: true }` if the address is free, `{ available: false }`
    if it's already on a user. No auth required — knowing whether an
    address is in use is the same fact the registration endpoint reveals
    anyway, just without burning a 400.
    """
    normalised = (email or "").strip().lower()
    if not normalised or "@" not in normalised:
        return {"available": True}
    exists = (
        db.query(User).filter(User.email.ilike(normalised)).first() is not None
    )
    return {"available": not exists}


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=201,
    summary="Register with email and password",
)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    # DEBUG — remove after confirming language_id arrives correctly
    logger.info("REGISTER BODY: %s", body.model_dump())

    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    user_kwargs = {
        "email":         body.email,
        "password_hash": hash_password(body.password),
        "full_name":     body.full_name,
        "role":          body.role,
    }
    if body.location:
        user_kwargs["location"] = body.location
    if body.phone:
        user_kwargs["phone"] = body.phone

    # Timezone resolution order:
    #   1. The location the user typed (Madrid → Europe/Madrid).
    #   2. An explicit timezone the frontend supplied.
    #   3. For tutors only, fall back to the language they teach so the
    #      app still has a sensible default before they fill in a location.
    if body.role == "student":
        user_kwargs["timezone"] = resolve_student_timezone(body.location, body.timezone)
    elif body.role == "teacher":
        location_tz = resolve_student_timezone(body.location, None) if body.location else None
        if location_tz and location_tz != "UTC":
            user_kwargs["timezone"] = location_tz
        elif body.timezone and is_valid_timezone(body.timezone):
            user_kwargs["timezone"] = body.timezone
        elif body.language_id is not None:
            lang = db.query(Language).filter(Language.id == body.language_id).first()
            if lang:
                tz = timezone_for_language(lang.code) or timezone_for_language(lang.name)
                if tz:
                    user_kwargs["timezone"] = tz
    elif body.timezone and is_valid_timezone(body.timezone):
        user_kwargs["timezone"] = body.timezone

    user = User(**user_kwargs)
    db.add(user)
    db.commit()
    db.refresh(user)

    if user.role == "student":
        student = Student(user_id=user.id, current_level="A1")
        db.add(student)
        db.commit()
        db.refresh(student)
        if body.language_id is not None:
            db.add(StudentLanguage(
                student_id=student.id,
                language_id=body.language_id,
                level="A1",
            ))
            db.commit()

    elif user.role == "teacher":
        if body.language_id is None:
            raise HTTPException(
                status_code=400,
                detail="Tutor registration requires a language_id.",
            )
        is_certified   = bool(body.is_certified)
        has_experience = bool(body.has_experience)
        if is_certified and has_experience:
            max_level = "C2"
        elif is_certified:
            max_level = "B2"
        else:
            max_level = "A2"

        db.add(Teacher(
            user_id        = user.id,
            language_id    = body.language_id,
            is_native      = bool(body.is_native),
            is_certified   = is_certified,
            has_experience = has_experience,
            max_level      = max_level,
            is_verified    = False,
            passed_exam    = False,
            bio            = body.bio or "",
        ))
        db.commit()

    access_token, refresh_token = issue_tokens(db, user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Sign in with email and password",
)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated.")
    if user.is_suspended:
        raise HTTPException(status_code=403, detail="Account is suspended.")

    access_token, refresh_token = issue_tokens(db, user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


# ── Password reset ────────────────────────────────────────────────────────────


@router.post(
    "/reset-password",
    summary="Reset a user's password (requires email + new password twice)",
)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")
    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=400, detail="Password must be at least 6 characters.",
        )

    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account found for that email.")

    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password reset successfully."}


# ── Token refresh ─────────────────────────────────────────────────────────────

@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Exchange refresh token for new token pair",
)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    try:
        user, new_access, new_refresh = rotate_refresh_token(db, body.refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        user=UserOut.model_validate(user),
    )


# ── Current user (deprecated alias) ─────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserOut,
    deprecated=True,
    summary="[Deprecated] Get current user profile",
)
def me(current_user: User = Depends(get_current_user)):
    return current_user


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post(
    "/logout",
    summary="Logout: blacklist access-token JTI + revoke refresh token",
)
def logout(
    request: Request,
    body: Optional[LogoutRequest] = None,
    db: Session = Depends(get_db),
):
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            payload = decode_access_token(auth_header[7:])
            jti     = payload.get("jti")
            exp_ts  = payload.get("exp")
            if jti and exp_ts:
                blacklist_jti(
                    db, jti,
                    datetime.fromtimestamp(exp_ts, tz=timezone.utc),
                )
        except JWTError:
            pass

    if body and body.refresh_token:
        token_hash = sha256_hex(body.refresh_token)
        stored = db.query(RefreshToken).filter(
            RefreshToken.token_hash == token_hash
        ).first()
        if stored:
            db.delete(stored)
            db.commit()

    return {"message": "Logged out successfully."}
