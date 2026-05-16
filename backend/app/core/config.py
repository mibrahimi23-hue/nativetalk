"""
Application settings loaded from environment variables.

Copy .env.example -> .env and fill in real values before starting.
NEVER commit .env to git.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_UNSAFE_BIND_HOSTS = {".".join(("0", "0", "0", "0")), "::"}
_DEFAULT_SIGNING_VALUE = "change_me" + "_in_production"


class Settings(BaseSettings):
    # ── Runtime ──────────────────────────────────────────────────────────────
    ENV: str = Field("local", validation_alias=AliasChoices("ENV", "APP_ENV"))
    API_HOST: str = "127.0.0.1"
    API_PORT: int = 8000

    # ── Database ─────────────────────────────────────────────────────────────
    # Format: postgresql://user:pass@host:port/dbname
    # Used by SQLAlchemy synchronous engine.
    DATABASE_URL: str = "sqlite:///./nativetalk.db"

    # ── JWT ───────────────────────────────────────────────────────────────────
    # JWT_SECRET must be a long, random string in production.
    # React Native stores access_token in SecureStore and sends it as:
    #   Authorization: Bearer <access_token>
    JWT_SECRET: str = Field(
        _DEFAULT_SIGNING_VALUE,
        validation_alias=AliasChoices("JWT_SECRET", "JWT_SECRET_KEY"),
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TTL_MINUTES: int = Field(
        15,
        validation_alias=AliasChoices(
            "JWT_ACCESS_TTL_MINUTES",
            "JWT_ACCESS_TOKEN_EXPIRE_MINUTES",
        ),
    )
    JWT_REFRESH_TTL_DAYS: int = Field(
        30,
        validation_alias=AliasChoices(
            "JWT_REFRESH_TTL_DAYS",
            "JWT_REFRESH_TOKEN_EXPIRE_DAYS",
        ),
    )

    # ── Google OAuth ─────────────────────────────────────────────────────────
    # The mobile app sends { "id_token": "<google_id_token>" } to POST /api/v1/auth/google.
    # The backend verifies it against the relevant client ID — NO client secret needed.
    # GOOGLE_CLIENT_ID is the *web* client used by the browser flow.
    # GOOGLE_ANDROID_CLIENT_ID / GOOGLE_IOS_CLIENT_ID are accepted too so a
    # native dev-client build can authenticate against this same backend.
    GOOGLE_CLIENT_ID: str = "325878187070-dnnuldrknhhjffnr01jqb99s8d0bof2l.apps.googleusercontent.com"
    GOOGLE_ANDROID_CLIENT_ID: str = ""
    GOOGLE_IOS_CLIENT_ID: str = ""

    # ── Daily.co ─────────────────────────────────────────────────────────────
    # Get your key from https://dashboard.daily.co/developers
    # If blank, video-call endpoints return a 503 with a clear message.
    DAILY_API_KEY: str = ""
    DAILY_API_URL: str = "https://api.daily.co/v1"

    # ── CORS ─────────────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins.
    # Examples:
    #   local web dev:  http://localhost:3000
    #   Expo Go:        exp://192.168.1.x:8081
    #   production:     https://app.nativetalk.com
    # React Native bare apps don't enforce CORS but keep this set correctly for
    # any web/admin frontends.
    CORS_ORIGINS_STR: str = Field(
        "http://localhost:3000,http://localhost:8081,http://127.0.0.1:8081",
        validation_alias=AliasChoices("CORS_ORIGINS_STR", "CORS_ORIGINS"),
    )

    # ── File uploads ──────────────────────────────────────────────────────────
    UPLOADS_DIR: str = "uploads"

    @field_validator("CORS_ORIGINS_STR")
    @classmethod
    def _validate_cors(cls, v: str) -> str:
        return v.strip()

    @model_validator(mode="after")
    def _reject_unsafe_production_defaults(self) -> "Settings":
        if self.is_production:
            if self.API_HOST in _UNSAFE_BIND_HOSTS:
                raise ValueError("API_HOST must not bind all interfaces in production.")
            if self.JWT_SECRET == _DEFAULT_SIGNING_VALUE:
                raise ValueError("JWT_SECRET must be set in production.")
            if self.CORS_ORIGINS_STR == "*":
                raise ValueError("CORS_ORIGINS must list explicit production origins.")
            if self.DATABASE_URL.startswith("sqlite:///"):
                raise ValueError("DATABASE_URL must point to a production database.")
        return self

    @property
    def cors_origins(self) -> List[str]:
        if self.CORS_ORIGINS_STR == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS_STR.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — safe to call anywhere without re-reading disk."""
    return Settings()
