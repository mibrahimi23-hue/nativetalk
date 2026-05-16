"""
Tests for tutor listing pagination and filters.

Covers:
  - Default pagination (limit=20, offset=0)
  - Custom limit and offset
  - max_price filter
  - language_id filter
  - Response shape: { items, total, limit, offset }

Requires a running PostgreSQL instance (uses DATABASE_URL from .env).
"""
import os
import uuid
from typing import List

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as SASession

os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/myproject")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-tutor-tests")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.main import app
from app.db import base as _base_models  # noqa: F401 — registers all models in mapper
from app.models.language import Language
from app.models.tutor import Teacher
from app.models.users import User

# Unique language IDs per test run to avoid collisions with production data
_LANG1 = 900 + abs(hash(str(uuid.uuid4())[:4])) % 50
_LANG2 = _LANG1 + 1


@pytest.fixture(scope="module")
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(scope="module")
def seeded_data() -> List[dict]:
    """
    Insert 25 verified teachers across two languages at various hourly rates,
    then yield.  Teardown deletes all inserted rows.
    """
    db = SessionLocal()
    inserted_users: List[User]    = []
    inserted_teachers: List[Teacher] = []
    try:
        for lang_id in (_LANG1, _LANG2):
            if not db.query(Language).filter(Language.id == lang_id).first():
                db.add(Language(id=lang_id, name=f"TestLang{lang_id}", code=f"t{lang_id}"))
        db.commit()

        for i in range(25):
            lang_id = _LANG1 if i < 15 else _LANG2
            hourly  = 10 + i   # 10–34 EUR/h
            user = User(
                id=uuid.uuid4(),
                email=f"tpag_{uuid.uuid4().hex[:8]}@test.com",
                password_hash=hash_password("pass1234"),
                full_name=f"Pag Tutor {i}",
                role="teacher",
            )
            db.add(user)
            db.flush()
            teacher = Teacher(
                id=uuid.uuid4(), user_id=user.id,
                language_id=lang_id, is_verified=True, max_level="C2",
                hourly_rate=hourly, is_native=False, is_certified=False,
                has_experience=True, passed_exam=False,
            )
            db.add(teacher)
            inserted_users.append(user)
            inserted_teachers.append(teacher)
        db.commit()
        yield {"lang1": _LANG1, "lang2": _LANG2, "count": 25}
    finally:
        for t in inserted_teachers:
            db.delete(t)
        for u in inserted_users:
            db.delete(u)
        for lang_id in (_LANG1, _LANG2):
            lang = db.query(Language).filter(Language.id == lang_id).first()
            if lang:
                db.delete(lang)
        db.commit()
        db.close()


# ── Tests ──────────────────────────────────────────────────

def test_list_tutors_response_shape(client, seeded_data):
    """Response must include items / total / limit / offset."""
    r = client.get(f"/api/v1/tutors/?language_id={seeded_data['lang1']}&limit=5")
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ("items", "total", "limit", "offset"):
        assert key in data, f"Missing key: {key}"
    assert data["limit"] == 5
    assert data["offset"] == 0


def test_list_tutors_default_pagination(client, seeded_data):
    """Ungated list must return ≤ 20 items by default."""
    r = client.get("/api/v1/tutors/")
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["items"]) <= 20
    assert data["limit"] == 20
    assert data["offset"] == 0


def test_list_tutors_language_filter(client, seeded_data):
    """language_id filter must restrict results to that language."""
    r = client.get(f"/api/v1/tutors/?language_id={seeded_data['lang1']}&limit=100")
    assert r.status_code == 200
    data = r.json()
    assert all(t["language_id"] == seeded_data["lang1"] for t in data["items"])
    assert data["total"] == 15   # 15 tutors for lang1


def test_list_tutors_max_price_filter(client, seeded_data):
    """max_price must exclude teachers with hourly_rate > max_price."""
    r = client.get(f"/api/v1/tutors/?language_id={seeded_data['lang1']}&max_price=15&limit=100")
    assert r.status_code == 200
    data = r.json()
    assert all(t["hourly_rate"] <= 15 for t in data["items"])


def test_list_tutors_offset_pagination(client, seeded_data):
    """Two pages must not overlap."""
    base = f"/api/v1/tutors/?language_id={seeded_data['lang1']}"
    r1 = client.get(f"{base}&limit=5&offset=0")
    r2 = client.get(f"{base}&limit=5&offset=5")
    assert r1.status_code == 200
    assert r2.status_code == 200
    ids1 = {t["id"] for t in r1.json()["items"]}
    ids2 = {t["id"] for t in r2.json()["items"]}
    assert ids1.isdisjoint(ids2), "Pages must not share items"


def test_list_tutors_total_is_stable(client, seeded_data):
    """total must not change between pages."""
    base = f"/api/v1/tutors/?language_id={seeded_data['lang1']}"
    t1 = client.get(f"{base}&limit=5&offset=0").json()["total"]
    t2 = client.get(f"{base}&limit=5&offset=5").json()["total"]
    assert t1 == t2


def test_list_tutors_limit_capped_at_100(client, seeded_data):
    """limit > 100 must return 422 Validation Error."""
    r = client.get("/api/v1/tutors/?limit=200")
    assert r.status_code == 422


def test_list_tutors_item_fields(client, seeded_data):
    """Each item must have the expected TeacherProfileOut fields."""
    r = client.get(f"/api/v1/tutors/?language_id={seeded_data['lang1']}&limit=1")
    assert r.status_code == 200
    if r.json()["items"]:
        item = r.json()["items"][0]
        for field in ("id", "user_id", "language_id", "is_verified", "max_level"):
            assert field in item, f"Missing field: {field}"

