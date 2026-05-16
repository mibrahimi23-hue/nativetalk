"""
Tests for refresh token rotation security.

Key invariants:
  1. A refreshed token cannot be reused (replay attack prevention).
  2. A used refresh token must be deleted from the database.
  3. Logout with refresh_token body revokes the token from the DB.
  4. After logout, the refresh token is no longer usable.

Requires a running PostgreSQL instance (uses DATABASE_URL from .env).
"""
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as SASession

os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/myproject")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-refresh-tests")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")

from app.db.session import SessionLocal
from app.main import app
from app.db import base as _base_models  # noqa: F401 — registers all models in mapper
from app.models.users import User

_TEST_EMAIL = f"refresh_rot_{uuid.uuid4().hex[:8]}@test.com"
_TEST_PASSWORD = "securepass1"


@pytest.fixture(scope="module")
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(scope="module")
def registered_user(client):
    """Register a fresh user and return the token response."""
    r = client.post("/api/v1/auth/register", json={
        "email":     _TEST_EMAIL,
        "password":  _TEST_PASSWORD,
        "full_name": "Refresh Test User",
        "role":      "student",
    })
    assert r.status_code == 201, r.text
    yield r.json()
    # Teardown: delete the test user from the real DB
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == _TEST_EMAIL).first()
        if user:
            db.delete(user)
            db.commit()
    finally:
        db.close()


# ── Tests ──────────────────────────────────────────────────

def test_refresh_returns_new_tokens(client, registered_user):
    old_refresh = registered_user["refresh_token"]
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token"  in data
    assert "refresh_token" in data
    assert data["refresh_token"] != old_refresh


def test_used_refresh_token_is_rejected(client):
    """After rotating, the old refresh token must no longer be valid."""
    # Get a fresh token pair by logging in
    r_login = client.post("/api/v1/auth/login", json={
        "email": _TEST_EMAIL, "password": _TEST_PASSWORD,
    })
    assert r_login.status_code == 200, r_login.text
    old_refresh = r_login.json()["refresh_token"]

    # First rotation — succeeds
    r1 = client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r1.status_code == 200, r1.text

    # Replay the same token — must be rejected
    r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r2.status_code == 401, f"Expected 401, got {r2.status_code}: {r2.text}"


def test_logout_with_refresh_token_revokes_it(client):
    """refresh_token passed in logout body must be revoked."""
    r_login = client.post("/api/v1/auth/login", json={
        "email": _TEST_EMAIL, "password": _TEST_PASSWORD,
    })
    assert r_login.status_code == 200, r_login.text
    tokens  = r_login.json()
    access  = tokens["access_token"]
    refresh = tokens["refresh_token"]

    # Logout — pass refresh token to revoke it
    r_logout = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access}"},
        json={"refresh_token": refresh},
    )
    assert r_logout.status_code == 200, r_logout.text

    # The refresh token must now be unusable
    r_refresh = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r_refresh.status_code == 401


def test_logout_without_refresh_token_still_succeeds(client, registered_user):
    """Logout without a body (or empty body) must return 200."""
    r = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {registered_user['access_token']}"},
    )
    assert r.status_code == 200

