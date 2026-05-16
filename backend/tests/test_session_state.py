"""
Tests for the session state machine.

Valid transitions:
  pending  → confirmed  (teacher only)
  pending  → cancelled  (teacher or student)
  confirmed → completed  (any authenticated participant)
  confirmed → cancelled  (teacher or student)

Invalid transitions must return **409 Conflict** — not 400.

Requires a running PostgreSQL instance (uses DATABASE_URL from .env).
"""
import os
import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as SASession

# Use real PostgreSQL — models use postgresql.UUID which is incompatible with SQLite
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/myproject")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-session-tests")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.db import base as _base_models  # noqa: F401 — registers all models (including Exam) in mapper
from app.models.language import Language
from app.models.payment import CoursePayment
from app.models.session import Session as BookingSession
from app.models.student import Student
from app.models.tutor import Teacher
from app.models.users import User


@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="module")
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ── Fixtures: teacher / student users ────────────────────────────────────────

@pytest.fixture(scope="module")
def teacher_user(db: SASession):
    user = User(
        id=uuid.uuid4(),
        email=f"st_teacher_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("password123"),
        full_name="State Test Teacher", role="teacher",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user
    db.delete(user); db.commit()


@pytest.fixture(scope="module")
def student_user(db: SASession):
    user = User(
        id=uuid.uuid4(),
        email=f"st_student_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("password123"),
        full_name="State Test Student", role="student",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user
    db.delete(user); db.commit()


@pytest.fixture(scope="module")
def teacher(db: SASession, teacher_user: User):
    # Ensure a Language row with id=1 exists
    if not db.query(Language).filter(Language.id == 1).first():
        db.add(Language(id=1, name="Spanish", code="es"))
        db.commit()
    t = Teacher(
        id=uuid.uuid4(), user_id=teacher_user.id,
        language_id=1, is_verified=True, max_level="C2",
        is_native=False, is_certified=False, has_experience=True, passed_exam=False,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    yield t
    db.delete(t); db.commit()


@pytest.fixture(scope="module")
def student(db: SASession, student_user: User):
    s = Student(id=uuid.uuid4(), user_id=student_user.id)
    db.add(s)
    db.commit()
    db.refresh(s)
    yield s
    db.delete(s); db.commit()


def _make_session(db: SASession, teacher: Teacher, student: Student, status: str) -> BookingSession:
    cp = CoursePayment(
        id=uuid.uuid4(), student_id=student.id, teacher_id=teacher.id,
        language_id=1, level="B1", total_hours=10,
        price_per_hour=15, total_amount=150, amount_paid=0, amount_left=150,
        payment_plan="hour_by_hour",
    )
    db.add(cp)
    db.commit()

    s = BookingSession(
        id=uuid.uuid4(), teacher_id=teacher.id, student_id=student.id,
        course_payment_id=cp.id, language_id=1,
        level="B1", scheduled_at=datetime(2099, 1, 1, 10, 0, 0),
        duration_minutes=60, status=status,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s, cp


def _auth(user: User) -> dict:
    token = create_access_token(str(user.id), user.role)
    return {"Authorization": f"Bearer {token}"}


# ── Tests ──────────────────────────────────────────────────

def test_confirm_pending_session_returns_200(client, db, teacher, student, teacher_user):
    s, cp = _make_session(db, teacher, student, "pending")
    r = client.patch(f"/api/v1/sessions/{s.id}/confirm", headers=_auth(teacher_user))
    assert r.status_code == 200, r.text
    db.delete(s); db.delete(cp); db.commit()


def test_confirm_already_confirmed_returns_409(client, db, teacher, student, teacher_user):
    s, cp = _make_session(db, teacher, student, "confirmed")
    r = client.patch(f"/api/v1/sessions/{s.id}/confirm", headers=_auth(teacher_user))
    assert r.status_code == 409, r.text
    db.delete(s); db.delete(cp); db.commit()


def test_confirm_completed_session_returns_409(client, db, teacher, student, teacher_user):
    s, cp = _make_session(db, teacher, student, "completed")
    r = client.patch(f"/api/v1/sessions/{s.id}/confirm", headers=_auth(teacher_user))
    assert r.status_code == 409, r.text
    db.delete(s); db.delete(cp); db.commit()


def test_complete_confirmed_session_returns_200(client, db, teacher, student, teacher_user):
    s, cp = _make_session(db, teacher, student, "confirmed")
    r = client.patch(f"/api/v1/sessions/{s.id}/complete", headers=_auth(teacher_user))
    assert r.status_code == 200, r.text
    db.delete(s); db.delete(cp); db.commit()


def test_complete_pending_session_returns_409(client, db, teacher, student, teacher_user):
    s, cp = _make_session(db, teacher, student, "pending")
    r = client.patch(f"/api/v1/sessions/{s.id}/complete", headers=_auth(teacher_user))
    assert r.status_code == 409, r.text
    db.delete(s); db.delete(cp); db.commit()


def test_cancel_pending_session_returns_200(client, db, teacher, student, teacher_user):
    s, cp = _make_session(db, teacher, student, "pending")
    r = client.patch(f"/api/v1/sessions/{s.id}/cancel", headers=_auth(teacher_user))
    assert r.status_code == 200, r.text
    db.delete(s); db.delete(cp); db.commit()


def test_cancel_confirmed_session_returns_200(client, db, teacher, student, student_user):
    s, cp = _make_session(db, teacher, student, "confirmed")
    r = client.patch(f"/api/v1/sessions/{s.id}/cancel", headers=_auth(student_user))
    assert r.status_code == 200, r.text
    db.delete(s); db.delete(cp); db.commit()


def test_cancel_completed_session_returns_409(client, db, teacher, student, teacher_user):
    s, cp = _make_session(db, teacher, student, "completed")
    r = client.patch(f"/api/v1/sessions/{s.id}/cancel", headers=_auth(teacher_user))
    assert r.status_code == 409, r.text
    db.delete(s); db.delete(cp); db.commit()


def test_cancel_already_cancelled_returns_409(client, db, teacher, student, teacher_user):
    s, cp = _make_session(db, teacher, student, "cancelled")
    r = client.patch(f"/api/v1/sessions/{s.id}/cancel", headers=_auth(teacher_user))
    assert r.status_code == 409, r.text
    db.delete(s); db.delete(cp); db.commit()
