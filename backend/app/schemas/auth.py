"""
Auth schemas — request bodies and responses for all auth endpoints.

React Native integration:
  POST /api/v1/auth/google
    Request body:  { "id_token": "<google_id_token_from_google_signin>" }
    Response:      TokenResponse

  POST /api/v1/auth/refresh
    Request body:  { "refresh_token": "<stored_refresh_token>" }
    Response:      TokenResponse

  GET /api/v1/users/me
    Header:        Authorization: Bearer <access_token>
    Response:      UserOut
"""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, field_validator

from app.schemas.user import UserOut  # single canonical definition


class GoogleLoginRequest(BaseModel):
    """
    React Native sends the Google ID token obtained from:
      import { GoogleSignin } from '@react-native-google-signin/google-signin';
      const { idToken } = await GoogleSignin.signIn();

    The optional *role* lets the mobile app pass the role chosen on the
    role-selection screen when a new user signs up with Google. It is
    ignored for existing accounts.
    """
    id_token: str
    role: Optional[Literal["student", "teacher"]] = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: Literal["student", "teacher"]

    # Optional profile-creation hints. These let the React Native onboarding flow
    # finalize the language/level/certification selection in a single call
    # instead of requiring a follow-up PATCH (which would 404 for new tutors
    # because no Teacher row exists yet).
    language_id:    Optional[int]  = None
    is_native:      Optional[bool] = None
    is_certified:   Optional[bool] = None
    has_experience: Optional[bool] = None
    bio:            Optional[str]  = None
    timezone:       Optional[str]  = None
    location:       Optional[str]  = None
    phone:          Optional[str]  = None

    @field_validator("password")
    @classmethod
    def _min_len(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    """
    React Native stores refresh_token in SecureStore and calls this endpoint
    when a 401 is received on any authenticated request.
    """
    refresh_token: str


class LogoutRequest(BaseModel):
    """
    Optional body for POST /auth/logout.
    If refresh_token is provided it will be revoked in the database in
    addition to blacklisting the access token JTI — ensuring the token
    cannot be used for a /auth/refresh call even if the client was
    offline when the logout happened.
    """
    refresh_token: Optional[str] = None


class TokenResponse(BaseModel):
    """
    Returned after successful login / google-auth / refresh.

    React Native should:
      1. Store access_token  in SecureStore (short-lived, 15 min)
      2. Store refresh_token in SecureStore (long-lived, 30 days)
      3. Attach to requests: headers: { Authorization: `Bearer ${accessToken}` }
    """
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    user:          UserOut

