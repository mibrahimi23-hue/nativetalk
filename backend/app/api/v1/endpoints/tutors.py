"""
Tutor (teacher) profile and availability endpoints.

React Native integration:
  GET /api/v1/tutors/                  → browse all verified tutors
  GET /api/v1/tutors/{teacher_id}      → single tutor profile
  GET /api/v1/tutors/{teacher_id}/availability  → their weekly schedule
  POST /api/v1/tutors/availability     → teacher adds a time slot (auth required)
  PUT/PATCH /api/v1/tutors/availability/{slot_id}  → edit slot (auth required)
  DELETE /api/v1/tutors/availability/{slot_id}  → remove slot (auth required)
"""
from __future__ import annotations

import uuid
from datetime import time
from functools import lru_cache
from typing import List

import pytz
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import NoSuchTableError
from sqlalchemy.orm import joinedload, load_only
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.teacher import AvailabilitySlot, Teacher
from app.models.users import User
from app.services.timezone import timezone_for_language
from app.schemas.tutor import (
    AvailabilityCreate,
    AvailabilityOut,
    PaginatedTutorResponse,
    TeacherOnboardingRequest,
    TeacherProfileOut,
    TeacherUpdate,
)

router = APIRouter(prefix="/tutors", tags=["Tutors"])

DAYS = {0: "Monday", 1: "Tuesday", 2: "Wednesday",
        3: "Thursday", 4: "Friday", 5: "Saturday", 6: "Sunday"}


@lru_cache(maxsize=1)
def _teacher_has_hourly_rate() -> bool:
    """Check once whether the optional hourly_rate column exists in the DB."""
    try:
        from app.db.session import engine
        return any(
            col["name"] == "hourly_rate"
            for col in sa_inspect(engine).get_columns("teachers")
        )
    except Exception:
        return False


def _teacher_to_out(t: Teacher, include_hourly_rate: bool = True) -> TeacherProfileOut:
    """Build a TeacherProfileOut including user and language fields."""
    user = t.user
    lang = t.language
    return TeacherProfileOut(
        id=t.id,
        user_id=t.user_id,
        language_id=t.language_id,
        is_native=t.is_native,
        is_certified=t.is_certified,
        has_experience=t.has_experience,
        max_level=t.max_level,
        is_verified=t.is_verified,
        passed_exam=t.passed_exam,
        bio=t.bio,
        hourly_rate=(
            float(t.hourly_rate)
            if include_hourly_rate and t.hourly_rate is not None
            else None
        ),
        payment_plan=getattr(t, "payment_plan", None) or "hour_by_hour",
        full_name=user.full_name if user else None,
        profile_photo=user.profile_photo if user else None,
        email=user.email if user else None,
        language_name=lang.name if lang else None,
    )


def _parse_availability(body: AvailabilityCreate) -> tuple[time, time]:
    if body.day_of_week < 0 or body.day_of_week > 6:
        raise HTTPException(status_code=400, detail="day_of_week must be between 0 and 6.")

    if body.timezone not in pytz.all_timezones_set:
        raise HTTPException(status_code=400, detail=f"Invalid timezone: {body.timezone}")

    try:
        start_t = time.fromisoformat(body.start_time)
        end_t = time.fromisoformat(body.end_time)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM:SS")

    if start_t >= end_t:
        raise HTTPException(status_code=400, detail="start_time must be before end_time.")

    return start_t, end_t


def _active_availability_conflict(
    db: Session,
    teacher_id: str,
    day_of_week: int,
    start_t: time,
    end_t: time,
    exclude_slot_id: str | None = None,
) -> AvailabilitySlot | None:
    query = db.query(AvailabilitySlot).filter(
        AvailabilitySlot.teacher_id == teacher_id,
        AvailabilitySlot.day_of_week == day_of_week,
        AvailabilitySlot.is_active == True,
        AvailabilitySlot.start_time < end_t,
        AvailabilitySlot.end_time > start_t,
    )
    if exclude_slot_id:
        query = query.filter(AvailabilitySlot.id != exclude_slot_id)
    return query.first()


def _availability_out(slot: AvailabilitySlot) -> AvailabilityOut:
    return AvailabilityOut(
        id=str(slot.id),
        day_of_week=slot.day_of_week,
        start_time=str(slot.start_time),
        end_time=str(slot.end_time),
        timezone=slot.timezone,
        is_active=slot.is_active,
    )


def _teaching_timezone(teacher: Teacher) -> str | None:
    lang = teacher.language
    if not lang:
        return None
    return timezone_for_language(lang.code) or timezone_for_language(lang.name)


# ── Browse tutors ──────────────────────────────────────────────────────────────

@router.get("/", response_model=PaginatedTutorResponse, summary="List verified tutors")
def list_tutors(
    language_id: int | None = None,
    level: str | None = None,
    max_price: int | None = Query(default=None, ge=1, description="Maximum hourly rate (EUR)"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    React Native search screen calls this with optional filters:
        GET /api/v1/tutors/?language_id=1&level=B1&max_price=25&limit=20&offset=0

    Returns a paginated result:
        { "items": [...], "total": 42, "limit": 20, "offset": 0 }
    """
    has_hourly_rate = _teacher_has_hourly_rate()
    load_columns = [
        Teacher.id,
        Teacher.user_id,
        Teacher.language_id,
        Teacher.is_native,
        Teacher.is_certified,
        Teacher.has_experience,
        Teacher.max_level,
        Teacher.is_verified,
        Teacher.passed_exam,
        Teacher.bio,
        Teacher.created_at,
    ]
    if has_hourly_rate:
        load_columns.append(Teacher.hourly_rate)

    q = (
        db.query(Teacher)
        .options(
            load_only(*load_columns),
            joinedload(Teacher.user),
            joinedload(Teacher.language),
        )
        .filter(Teacher.is_verified == True)
    )
    if language_id:
        q = q.filter(Teacher.language_id == language_id)
    if level:
        q = q.filter(Teacher.max_level >= level)
    if max_price is not None and has_hourly_rate:
        q = q.filter(Teacher.hourly_rate <= max_price)
    total = q.count()
    items = q.offset(offset).limit(limit).all()
    return PaginatedTutorResponse(
        items=[_teacher_to_out(t, include_hourly_rate=has_hourly_rate) for t in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{teacher_id}", response_model=TeacherProfileOut, summary="Get tutor profile")
def get_tutor(teacher_id: str, db: Session = Depends(get_db)):
    has_hourly_rate = _teacher_has_hourly_rate()
    load_columns = [
        Teacher.id,
        Teacher.user_id,
        Teacher.language_id,
        Teacher.is_native,
        Teacher.is_certified,
        Teacher.has_experience,
        Teacher.max_level,
        Teacher.is_verified,
        Teacher.passed_exam,
        Teacher.bio,
        Teacher.created_at,
    ]
    if has_hourly_rate:
        load_columns.append(Teacher.hourly_rate)

    teacher = (
        db.query(Teacher)
        .options(
            load_only(*load_columns),
            joinedload(Teacher.user),
            joinedload(Teacher.language),
        )
        .filter(Teacher.id == teacher_id)
        .first()
    )
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found.")
    return _teacher_to_out(teacher, include_hourly_rate=has_hourly_rate)


# ── Availability ───────────────────────────────────────────────────────────────

@router.get(
    "/{teacher_id}/availability",
    response_model=List[AvailabilityOut],
    summary="Get teacher's weekly availability",
)
def get_availability(teacher_id: str, db: Session = Depends(get_db)):
    """
    Returns active availability slots. React Native booking screen uses
    these to show open time slots.
    """
    slots = db.query(AvailabilitySlot).filter(
        AvailabilitySlot.teacher_id == teacher_id,
        AvailabilitySlot.is_active  == True,
    ).all()
    return [_availability_out(s) for s in slots]


@router.post(
    "/availability",
    status_code=201,
    summary="Add availability slot (teacher only)",
)
def add_availability(
    body: AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("teacher")),
):
    """
    Teacher sets weekly availability.
    Request:
        { "day_of_week": 1, "start_time": "09:00:00",
          "end_time": "11:00:00", "timezone": "Europe/Madrid" }
    """
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found.")

    start_t, end_t = _parse_availability(body)

    # Check for overlap
    conflict = _active_availability_conflict(
        db,
        str(teacher.id),
        body.day_of_week,
        start_t,
        end_t,
    )
    if conflict:
        raise HTTPException(
            status_code=400,
            detail=f"Overlaps with existing slot on {DAYS[body.day_of_week]} "
                   f"{conflict.start_time}–{conflict.end_time}.",
        )

    slot_timezone = _teaching_timezone(teacher) or current_user.timezone or body.timezone
    current_user.timezone = slot_timezone

    slot = AvailabilitySlot(
        id          = uuid.uuid4(),
        teacher_id  = teacher.id,
        day_of_week = body.day_of_week,
        start_time  = start_t,
        end_time    = end_t,
        timezone    = slot_timezone,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return {
        "message": "Availability slot added.",
        "slot_id": str(slot.id),
        "slot": _availability_out(slot),
    }


@router.put(
    "/availability/{slot_id}",
    response_model=AvailabilityOut,
    summary="Update availability slot (teacher only)",
)
def update_availability(
    slot_id: str,
    body: AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("teacher")),
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found.")

    slot = db.query(AvailabilitySlot).filter(
        AvailabilitySlot.id == slot_id,
        AvailabilitySlot.teacher_id == teacher.id,
        AvailabilitySlot.is_active == True,
    ).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found.")

    start_t, end_t = _parse_availability(body)
    conflict = _active_availability_conflict(
        db,
        str(teacher.id),
        body.day_of_week,
        start_t,
        end_t,
        exclude_slot_id=slot_id,
    )
    if conflict:
        raise HTTPException(
            status_code=400,
            detail=f"Overlaps with existing slot on {DAYS[body.day_of_week]} "
                   f"{conflict.start_time}–{conflict.end_time}.",
        )

    slot_timezone = _teaching_timezone(teacher) or current_user.timezone or body.timezone
    current_user.timezone = slot_timezone

    slot.day_of_week = body.day_of_week
    slot.start_time = start_t
    slot.end_time = end_t
    slot.timezone = slot_timezone

    db.commit()
    db.refresh(slot)
    return _availability_out(slot)


@router.patch(
    "/availability/{slot_id}",
    response_model=AvailabilityOut,
    summary="Update availability slot (teacher only)",
)
def patch_availability(
    slot_id: str,
    body: AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("teacher")),
):
    return update_availability(slot_id, body, db, current_user)


@router.delete(
    "/availability/{slot_id}",
    summary="Remove availability slot (teacher only)",
)
def delete_availability(
    slot_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("teacher")),
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found.")

    slot = db.query(AvailabilitySlot).filter(
        AvailabilitySlot.id        == slot_id,
        AvailabilitySlot.teacher_id == teacher.id,
    ).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found.")

    slot.is_active = False
    db.commit()
    return {"message": "Slot removed."}


@router.patch(
    "/me",
    response_model=TeacherProfileOut,
    summary="Update own teacher profile (teacher only)",
)
def update_profile(
    body: TeacherUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("teacher")),
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found.")

    patch = body.model_dump(exclude_unset=True)
    if "payment_plan" in patch:
        if patch["payment_plan"] not in {"hour_by_hour", "50_50", "80_20"}:
            raise HTTPException(
                status_code=400,
                detail="payment_plan must be one of hour_by_hour, 50_50, 80_20.",
            )
    cert_changed = "is_certified" in patch or "has_experience" in patch
    for field, value in patch.items():
        setattr(teacher, field, value)

    # Re-derive max_level from cert/experience flags so the data stays consistent
    # if the tutor goes back to the certification screen and picks a different
    # option. Verified teachers may already have an exam-based level above this
    # baseline — don't downgrade them.
    if cert_changed and not teacher.is_verified:
        if teacher.is_certified and teacher.has_experience:
            teacher.max_level = "C2"
        elif teacher.is_certified:
            teacher.max_level = "B2"
        else:
            teacher.max_level = "A2"

    db.commit()
    db.refresh(teacher)
    return _teacher_to_out(teacher)


@router.post(
    "/onboarding",
    response_model=TeacherProfileOut,
    status_code=201,
    summary="Create the Teacher profile for the current user",
    description=(
        "Used after Google sign-in (or any flow where the User row exists "
        "before the Teacher row). Promotes the user to role='teacher' if "
        "needed and inserts a Teacher row with the chosen language and "
        "certification answers."
    ),
)
def complete_teacher_onboarding(
    body: TeacherOnboardingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Teacher profile already exists for this user.",
        )

    is_certified   = bool(body.is_certified)
    has_experience = bool(body.has_experience)
    if is_certified and has_experience:
        max_level = "C2"
    elif is_certified:
        max_level = "B2"
    else:
        max_level = "A2"

    teacher = Teacher(
        user_id        = current_user.id,
        language_id    = body.language_id,
        is_native      = bool(body.is_native),
        is_certified   = is_certified,
        has_experience = has_experience,
        max_level      = max_level,
        is_verified    = False,
        passed_exam    = False,
        bio            = body.bio or "",
    )
    db.add(teacher)

    if current_user.role != "teacher":
        current_user.role = "teacher"
    db.flush()
    teaching_tz = _teaching_timezone(teacher)
    if teaching_tz:
        current_user.timezone = teaching_tz

    db.commit()
    db.refresh(teacher)
    return _teacher_to_out(teacher)
