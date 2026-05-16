"""
Session booking, management, and Daily.co video-call endpoints.

─────────────────────────────────────────────────────────────────────────────
React Native integration quick-reference
─────────────────────────────────────────────────────────────────────────────

Booking a session:
  POST /api/v1/sessions/
  Headers: { Authorization: Bearer <access_token> }
  Body: BookingCreate schema

Getting the video call URL (opens 15 min before session):
  1. POST /api/v1/sessions/{id}/daily/room   → creates/gets Daily room
  2. POST /api/v1/sessions/{id}/daily/token  → gets your meeting token

  React Native call setup:
    import DailyIframe from '@daily-co/react-native-daily-js';
    const call = DailyIframe.createCallObject();
    await call.join({ url: room_url, token: meeting_token });
─────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import List

import pytz
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.payment import CoursePayment
from app.models.session import Session as BookingSession
from app.models.student import Student
from app.models.suspension import Suspension
from app.models.teacher import Teacher
from app.models.users import User
from app.models.language import LevelPricing, LevelHours
from app.schemas.session import BookingCreate, DailyRoomOut, DailyTokenOut, SessionOut
from app.services.daily import get_daily_client

router = APIRouter(prefix="/sessions", tags=["Sessions"])

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
COURSE_REUSE_STATUSES = ("active", "completed")


def _revalidate_active_suspension(db: Session, user: User) -> Suspension | None:
    """
    Return the user's *currently valid* active suspension, or None if no
    block applies any more. Auto-suspensions (absence_limit /
    reschedule_limit) are re-evaluated against the *same definitions* the
    admin Manage Students page uses, so a student who's no longer eligible
    by the admin's own criteria isn't stuck behind a stale row.

    Manual / explicit suspensions ('admin_action', 'no_show_limit',
    custom reasons) are never auto-lifted — those require the admin's
    `/admin/unsuspend` endpoint.
    """
    active = (
        db.query(Suspension)
        .filter(
            Suspension.user_id == user.id,
            Suspension.is_active == True,  # noqa: E712
        )
        .order_by(Suspension.suspended_at.desc())
        .first()
    )
    if not active:
        return None

    reason = (active.reason or "").lower()
    still_valid = True

    # Match the admin Manage Students rule:
    #   eligible = reschedules >= 5 OR (attendance == 0% AND any cancellation)
    # i.e. a student with fewer than 5 reschedules must also have zero
    # attendance plus a cancellation, otherwise the leftover row gets lifted.
    if reason in ("absence_limit", "reschedule_limit"):
        student = db.query(Student).filter(Student.user_id == user.id).first()
        if student:
            total = (
                db.query(BookingSession)
                .filter(BookingSession.student_id == student.id)
                .count()
            )
            completed = (
                db.query(BookingSession)
                .filter(
                    BookingSession.student_id == student.id,
                    BookingSession.status == "completed",
                )
                .count()
            )
            cancelled = (
                db.query(BookingSession)
                .filter(
                    BookingSession.student_id == student.id,
                    BookingSession.status == "cancelled",
                )
                .count()
            )
            attendance = round(completed / total * 100) if total > 0 else 100
            reschedules = student.reschedule_count or 0
            still_valid = reschedules >= 5 or (attendance == 0 and cancelled > 0)
        else:
            still_valid = False

    if still_valid:
        return active

    # Stale auto-suspension — lift it and let the booking proceed.
    active.is_active = False
    from datetime import datetime as _dt, timezone as _tz
    active.lifted_at = _dt.now(_tz.utc)
    if user.is_suspended:
        user.is_suspended = False
        user.is_active = True
    db.commit()
    return None


def _booked_session_count(db: Session, course_payment_id: str) -> int:
    return (
        db.query(BookingSession)
        .filter(
            BookingSession.course_payment_id == course_payment_id,
            BookingSession.status != "cancelled",
        )
        .count()
    )


def _find_reusable_course_payment(
    db: Session,
    *,
    student_id: str,
    teacher_id: str,
    language_id: int,
    level: str,
) -> CoursePayment | None:
    rows = (
        db.query(CoursePayment)
        .filter(
            CoursePayment.student_id == student_id,
            CoursePayment.teacher_id == teacher_id,
            CoursePayment.language_id == language_id,
            CoursePayment.level == level,
            CoursePayment.payment_plan.in_(("50_50", "80_20")),
            CoursePayment.status.in_(COURSE_REUSE_STATUSES),
        )
        .order_by(CoursePayment.created_at.desc())
        .all()
    )
    for cp in rows:
        if _booked_session_count(db, str(cp.id)) < int(cp.total_hours):
            return cp
    return None


# ── Session CRUD ──────────────────────────────────────────────────────────────

@router.post("/", response_model=SessionOut, status_code=201, summary="Book a new session")
def book_session(
    body: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates a CoursePayment (if new) and a Session record.

    Request:
        {
          "teacher_id": "uuid",
          "student_id": "uuid",
          "language_id": 1,
          "level": "B1",
          "scheduled_at": "2026-06-01T10:00:00Z",
          "student_timezone": "Europe/Madrid",
          "total_hours": 30,
          "price_per_hour": 15.0,
          "payment_plan": "hour_by_hour"
        }
    """
    if body.level not in LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid level. Must be one of {LEVELS}")

    # Resolve student from auth context when frontend omits student_id.
    student_id = body.student_id
    if not student_id:
        student = db.query(Student).filter(Student.user_id == current_user.id).first()
        if not student:
            raise HTTPException(status_code=404, detail="Student profile not found for current user.")
        student_id = str(student.id)

    # Validate teacher and student exist
    teacher = db.query(Teacher).filter(Teacher.id == body.teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found.")
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    # Suspension checks — auto-lift stale absence/reschedule suspensions
    # before rejecting, so a student whose counts have fallen back under
    # the threshold isn't permanently locked out by a leftover row.
    for usr in (
        db.query(User).filter(User.id == teacher.user_id).first(),
        db.query(User).filter(User.id == student.user_id).first(),
    ):
        if not usr:
            continue
        active_suspension = _revalidate_active_suspension(db, usr)
        if active_suspension:
            raise HTTPException(
                status_code=403,
                detail=f"Account is suspended. Reason: {active_suspension.reason}",
            )

    # Teacher level check
    if LEVELS.index(body.level) > LEVELS.index(teacher.max_level):
        raise HTTPException(
            status_code=400,
            detail=f"Teacher max level is {teacher.max_level}.",
        )

    # Price validation
    pricing = db.query(LevelPricing).filter_by(level=body.level).first()
    if pricing and not (float(pricing.price_min) <= body.price_per_hour <= float(pricing.price_max)):
        raise HTTPException(
            status_code=400,
            detail=f"Price must be {pricing.price_min}–{pricing.price_max} EUR/h for level {body.level}.",
        )

    # Hours validation
    hours_limit = db.query(LevelHours).filter_by(level=body.level).first()
    if hours_limit and not (hours_limit.hours_min <= body.total_hours <= hours_limit.hours_max):
        raise HTTPException(
            status_code=400,
            detail=f"Total hours must be {hours_limit.hours_min}–{hours_limit.hours_max} for level {body.level}.",
        )

    student_user = db.query(User).filter(User.id == student.user_id).first()
    student_timezone = (
        student_user.timezone
        if student_user and student_user.timezone in pytz.all_timezones_set
        else body.student_timezone
    )
    if student_timezone not in pytz.all_timezones_set:
        raise HTTPException(status_code=400, detail="Invalid student_timezone.")

    tz = pytz.timezone(student_timezone)
    if body.scheduled_at.tzinfo is None:
        scheduled_utc = tz.localize(body.scheduled_at).astimezone(pytz.utc).replace(tzinfo=None)
    else:
        scheduled_utc = body.scheduled_at.astimezone(pytz.utc).replace(tzinfo=None)

    # Conflict check — same teacher, same time
    conflict = db.query(BookingSession).filter(
        and_(
            BookingSession.teacher_id   == body.teacher_id,
            BookingSession.status.in_(["pending", "confirmed"]),
            BookingSession.scheduled_at == scheduled_utc,
        )
    ).first()
    if conflict:
        raise HTTPException(status_code=400, detail="Teacher already has a session at that time.")

    # Before enforcing "review your last lesson first", purge any zombie
    # completed sessions that never actually happened (no room ever opened).
    # Those used to leave the student permanently locked out of booking.
    stale = (
        db.query(BookingSession)
        .filter(BookingSession.student_id == student_id)
        .all()
    )
    _auto_cancel_stale_no_room(db, stale)

    # Pending review check — prevent booking if student has unreviewed sessions
    pending_review = db.query(BookingSession).filter(
        and_(
            BookingSession.student_id         == student_id,
            BookingSession.status             == "completed",
            BookingSession.student_review_done == False,
        )
    ).first()
    if pending_review:
        raise HTTPException(
            status_code=400,
            detail=f"Please review session {pending_review.id} before booking a new one.",
        )

    # CoursePayment — reuse an existing credit when the student is rebooking
    # a tutor-cancelled lesson, otherwise create a fresh CoursePayment.
    course_payment = None
    if body.course_payment_id:
        course_payment = db.query(CoursePayment).filter(
            CoursePayment.id == body.course_payment_id
        ).first()
        if not course_payment:
            raise HTTPException(status_code=404, detail="Course payment not found.")
        if str(course_payment.student_id) != str(student_id):
            raise HTTPException(status_code=403, detail="Course payment does not belong to you.")
        if course_payment.status == "credit_available":
            # Mark tutor-cancelled credit as consumed so it can't be reused twice.
            course_payment.status = "active"
        elif course_payment.status in COURSE_REUSE_STATUSES:
            if str(course_payment.teacher_id) != str(body.teacher_id):
                raise HTTPException(status_code=400, detail="Course payment is for another tutor.")
            if int(course_payment.language_id) != int(body.language_id):
                raise HTTPException(status_code=400, detail="Course payment is for another language.")
            if str(course_payment.level) != str(body.level):
                raise HTTPException(status_code=400, detail="Course payment is for another level.")
            if _booked_session_count(db, str(course_payment.id)) >= int(course_payment.total_hours):
                raise HTTPException(status_code=400, detail="All paid hours are already booked.")
        else:
            raise HTTPException(status_code=400, detail="Course payment is not available for booking.")

    if course_payment is None and body.payment_plan in ("50_50", "80_20"):
        course_payment = _find_reusable_course_payment(
            db,
            student_id=str(student_id),
            teacher_id=str(body.teacher_id),
            language_id=body.language_id,
            level=body.level,
        )

    if course_payment is None:
        billable_hours = 1 if body.payment_plan == "hour_by_hour" else body.total_hours
        total_amount = round(body.price_per_hour * billable_hours, 2)
        course_payment = CoursePayment(
            id             = uuid.uuid4(),
            student_id     = student_id,
            teacher_id     = body.teacher_id,
            language_id    = body.language_id,
            level          = body.level,
            total_hours    = billable_hours,
            price_per_hour = body.price_per_hour,
            total_amount   = total_amount,
            amount_paid    = 0,
            amount_left    = total_amount,
            payment_plan   = body.payment_plan,
        )
        db.add(course_payment)
    db.commit()
    db.refresh(course_payment)

    # Session
    # Auto-confirm on book so the student/tutor can immediately use the chat
    # invitation and Daily room flows without needing a separate "confirm"
    # action from the tutor (the wireframe doesn't surface that step).
    session = BookingSession(
        id               = uuid.uuid4(),
        teacher_id       = body.teacher_id,
        student_id       = student_id,
        course_payment_id = course_payment.id,
        language_id      = body.language_id,
        level            = body.level,
        scheduled_at     = scheduled_utc,
        duration_minutes = 60,
        status           = "confirmed",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return SessionOut(
        id=str(session.id),
        teacher_id=str(session.teacher_id),
        student_id=str(session.student_id),
        course_payment_id=str(session.course_payment_id),
        language_id=session.language_id,
        level=session.level,
        scheduled_at=session.scheduled_at,
        duration_minutes=session.duration_minutes,
        status=session.status,
        daily_room_url=session.daily_room_url,
        teacher_review_done=session.teacher_review_done,
        student_review_done=session.student_review_done,
        payment_released=session.payment_released,
    )


# ── FIX: /mine must be defined BEFORE /{session_id} to avoid route conflict ──

def _auto_cancel_stale_no_room(db: Session, sessions: list[BookingSession]) -> None:
    """
    Lazy cleanup that prevents passed-end lessons from sitting in the
    Upcoming list forever. Three cases get flipped to `cancelled` here:

      1. A session already flagged `completed` despite no Daily room
         existing — leftover from the old buggy "tick the box on the
         dashboard" flow that bypassed the room check.
      2. A pending/confirmed/no_show session whose scheduled end is in the
         past (incl. 15 min grace) AND no room was ever created — a clear
         tutor no-show.
      3. A pending/confirmed session whose scheduled end is in the past
         even though a room *was* created — neither side actually used the
         call (no one pressed "Lesson finished", no one marked attendance,
         the videocall stayed empty), so the booking has timed out.

    Any paid amount on the linked CoursePayment is converted back into a
    `credit_available` balance so the student isn't out of pocket for a
    lesson that didn't run.
    """
    now = datetime.now(timezone.utc)
    changed = False
    for s in sessions:
        if s.status not in ("pending", "confirmed", "completed", "no_show"):
            continue
        should_cancel = False

        if s.status == "completed" and not s.daily_room_name:
            # Marked completed without a room ever existing — impossible.
            should_cancel = True
        elif s.status in ("pending", "confirmed", "no_show"):
            sch_at = s.scheduled_at
            if sch_at is None:
                continue
            if sch_at.tzinfo is None:
                sch_at = sch_at.replace(tzinfo=timezone.utc)
            # Grace: 15 min past scheduled end before we declare it dead.
            ended_at = sch_at + timedelta(minutes=(s.duration_minutes or 60) + 15)
            if now >= ended_at:
                # The lesson's day has passed. If anyone had actually used
                # the call, the videocall flow would have moved the row to
                # "completed" / "absent" / "no_show" → none of those are
                # still pending or confirmed. Reaching this branch means
                # no one took action: auto-cancel and refund as credit.
                should_cancel = True

        if not should_cancel:
            continue

        s.status = "cancelled"
        # nothing to review — silences the pending-review block on booking
        s.teacher_review_done = True
        s.student_review_done = True

        course_payment = db.query(CoursePayment).filter(
            CoursePayment.id == s.course_payment_id
        ).first()
        if course_payment and float(course_payment.amount_paid or 0) > 0:
            # Restore the student's balance as a usable credit
            if course_payment.status not in ("credit_available", "suspended"):
                course_payment.status = "credit_available"
        changed = True

    if changed:
        db.commit()
        for s in sessions:
            db.refresh(s)


@router.get("/mine", response_model=List[SessionOut], summary="List my sessions")
def list_my_sessions(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    student = db.query(Student).filter(Student.user_id == current_user.id).first()

    query = db.query(BookingSession)
    if teacher and not student:
        query = query.filter(BookingSession.teacher_id == teacher.id)
    elif student and not teacher:
        query = query.filter(BookingSession.student_id == student.id)
    elif teacher and student:
        query = query.filter(
            (BookingSession.teacher_id == teacher.id) | (BookingSession.student_id == student.id)
        )
    else:
        return []

    # Run the lazy cleanup BEFORE the status filter, otherwise rows that
    # should flip from "completed" → "cancelled" never get touched when the
    # caller passes status="completed".
    all_rows = query.all()
    _auto_cancel_stale_no_room(db, all_rows)

    if status:
        query = query.filter(BookingSession.status == status)

    sessions = query.order_by(BookingSession.scheduled_at.desc()).all()
    return [
        SessionOut(
            id=str(s.id),
            teacher_id=str(s.teacher_id),
            student_id=str(s.student_id),
            course_payment_id=str(s.course_payment_id),
            language_id=s.language_id,
            level=s.level,
            scheduled_at=s.scheduled_at,
            duration_minutes=s.duration_minutes,
            status=s.status,
            daily_room_url=s.daily_room_url,
            teacher_review_done=s.teacher_review_done,
            student_review_done=s.student_review_done,
            payment_released=s.payment_released,
        )
        for s in sessions
    ]


@router.get("/credits", summary="List paid lessons the student can rebook for free")
def list_my_credits(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns CoursePayments that the student already paid for but where the
    tutor cancelled — the student can book a replacement session against any
    of these without paying again.
    """
    student = db.query(Student).filter(Student.user_id == current_user.id).first()
    if not student:
        return []

    rows = (
        db.query(CoursePayment)
        .filter(
            CoursePayment.student_id == student.id,
            CoursePayment.status == "credit_available",
        )
        .order_by(CoursePayment.created_at.desc())
        .all()
    )
    out = []
    for cp in rows:
        teacher = db.query(Teacher).filter(Teacher.id == cp.teacher_id).first()
        teacher_user = (
            db.query(User).filter(User.id == teacher.user_id).first() if teacher else None
        )
        out.append({
            "course_payment_id": str(cp.id),
            "teacher_id":        str(cp.teacher_id),
            "teacher_name":      teacher_user.full_name if teacher_user else None,
            "language_id":       cp.language_id,
            "level":             cp.level,
            "total_hours":       cp.total_hours,
            "price_per_hour":    float(cp.price_per_hour),
            "amount_paid":       float(cp.amount_paid or 0),
            "payment_plan":      cp.payment_plan,
            "created_at":        str(cp.created_at) if cp.created_at else None,
        })
    return out


@router.get("/my-students", summary="List students this teacher has booked sessions with")
def list_my_students(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the distinct students this teacher has had at least one session
    with, along with their session counts. Used by the tutor dashboard to
    surface the "My Students" section from the wireframe.
    """
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found.")

    rows = (
        db.query(BookingSession.student_id, BookingSession.status)
        .filter(BookingSession.teacher_id == teacher.id)
        .all()
    )

    by_student: dict[str, dict[str, int]] = {}
    for student_id, status in rows:
        key = str(student_id)
        bucket = by_student.setdefault(key, {"total": 0, "upcoming": 0, "completed": 0})
        bucket["total"] += 1
        if status == "completed":
            bucket["completed"] += 1
        elif status in ("pending", "confirmed"):
            bucket["upcoming"] += 1

    out = []
    for student_id, stats in by_student.items():
        student = db.query(Student).filter(Student.id == student_id).first()
        if not student:
            continue
        user = db.query(User).filter(User.id == student.user_id).first()
        if not user:
            continue
        out.append({
            "student_id":    student_id,
            "user_id":       str(user.id),
            "full_name":     user.full_name,
            "email":         user.email,
            "profile_photo": user.profile_photo,
            "current_level": student.current_level,
            "total_sessions":     stats["total"],
            "upcoming_sessions":  stats["upcoming"],
            "completed_sessions": stats["completed"],
        })
    out.sort(key=lambda r: r["upcoming_sessions"], reverse=True)
    return out


@router.get("/{session_id}", response_model=SessionOut, summary="Get session details")
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(BookingSession).filter(BookingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    return SessionOut(
        id=str(session.id),
        teacher_id=str(session.teacher_id),
        student_id=str(session.student_id),
        course_payment_id=str(session.course_payment_id),
        language_id=session.language_id,
        level=session.level,
        scheduled_at=session.scheduled_at,
        duration_minutes=session.duration_minutes,
        status=session.status,
        daily_room_url=session.daily_room_url,
        teacher_review_done=session.teacher_review_done,
        student_review_done=session.student_review_done,
        payment_released=session.payment_released,
    )


@router.patch("/{session_id}/confirm", summary="Confirm a pending session (teacher only)")
def confirm_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(BookingSession).filter(BookingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot confirm a session with status '{session.status}'.",
        )

    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher or str(teacher.id) != str(session.teacher_id):
        raise HTTPException(status_code=403, detail="Not authorised.")

    session.status = "confirmed"
    db.commit()
    return {"message": "Session confirmed.", "session_id": session_id}


@router.patch("/{session_id}/complete", summary="Mark session as completed")
def complete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(BookingSession).filter(BookingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.status != "confirmed":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot complete a session with status '{session.status}'.",
        )
    # A lesson can only be completed if the tutor actually opened the Daily
    # room. If no room was ever created the videocall never happened, so the
    # caller should route through the tutor-didn't-join / cancel flow instead
    # — completing here would let an unattended booking silently absorb the
    # student's payment.
    if not session.daily_room_name:
        raise HTTPException(
            status_code=409,
            detail="Tutor never opened the video room — cancel the session instead.",
        )
    # Hard date guard — a session can only be completed once its scheduled
    # start has passed. Otherwise the tutor could tick "done" on a future
    # lesson from the dashboard and silently claim the student's payment.
    now = datetime.now(timezone.utc)
    sch_at = session.scheduled_at
    if sch_at is not None:
        if sch_at.tzinfo is None:
            sch_at = sch_at.replace(tzinfo=timezone.utc)
        if now < sch_at:
            raise HTTPException(
                status_code=400,
                detail="A lesson can only be marked as done after its scheduled time.",
            )

    session.status = "completed"
    db.commit()
    return {"message": "Session marked as completed.", "session_id": session_id}


@router.patch("/{session_id}/cancel", summary="Cancel a session")
def cancel_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Either party (teacher or student) may cancel a session while it is
    `pending`, `confirmed`, or `no_show`. Completed or already-cancelled
    sessions return **409 Conflict**.

    Cancellation deadline: at least 24 hours before scheduled_at — except
    when the session is already marked `no_show` (the tutor never joined),
    in which case the student may cancel right away and receive the paid
    amount back as a course credit.
    """
    session = db.query(BookingSession).filter(BookingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.status not in ("pending", "confirmed", "no_show"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel a session with status '{session.status}'.",
        )

    # Verify caller is a participant
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    student = db.query(Student).filter(Student.user_id == current_user.id).first()
    is_teacher = teacher and str(teacher.id) == str(session.teacher_id)
    is_student = student and str(student.id) == str(session.student_id)
    if not (is_teacher or is_student):
        raise HTTPException(status_code=403, detail="Not a participant in this session.")

    # 24h cancellation deadline — skipped when the session is already a tutor
    # no-show, so the student is never trapped paying for a lesson the tutor
    # didn't attend.
    if session.status != "no_show":
        now = datetime.now(timezone.utc)
        scheduled_at = session.scheduled_at
        if scheduled_at is not None:
            if scheduled_at.tzinfo is None:
                scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
            if now > scheduled_at - timedelta(hours=24):
                raise HTTPException(
                    status_code=400,
                    detail="Cancellations must be requested at least 24 hours before "
                           "the lesson starts.",
                )

    was_no_show = session.status == "no_show"
    session.status = "cancelled"

    # Issue a credit when:
    #  - the tutor cancels (existing behaviour), or
    #  - the student cancels a tutor no-show (refund case from the
    #    "Tutor didn't join" flow → paid amount becomes a balance the
    #    student can spend on a replacement booking).
    if is_teacher or (is_student and was_no_show):
        course_payment = db.query(CoursePayment).filter(
            CoursePayment.id == session.course_payment_id
        ).first()
        if course_payment and float(course_payment.amount_paid or 0) > 0:
            course_payment.status = "credit_available"

    db.commit()
    return {"message": "Session cancelled.", "session_id": session_id}


# ── Daily.co video call ────────────────────────────────────────────────────────

@router.post(
    "/{session_id}/daily/room",
    response_model=DailyRoomOut,
    summary="Create or get Daily.co room for a session",
    description=(
        "Creates a Daily.co room for the session if it doesn't exist yet. "
        "Available starting 30 minutes before scheduled_at."
    ),
)
def get_or_create_daily_room(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    React Native calls this to get the video call URL before joining.

    The room can only be opened starting 30 minutes before scheduled_at —
    earlier than that the endpoint returns 400 with the exact UI-facing
    message the tutor dashboard renders inline.
    """
    session = _get_accessible_session(session_id, current_user, db, allow_pending=True)

    # A pending reschedule means the lesson is being moved — close the live
    # room for both parties immediately so they leave the call and wait for
    # the new time to be accepted/rejected.
    if _has_pending_reschedule(db, session.id):
        raise HTTPException(
            status_code=400,
            detail="This session was rescheduled — the video room is closed.",
        )

    now      = datetime.now(timezone.utc)
    sch_at   = session.scheduled_at
    if sch_at.tzinfo is None:
        sch_at = sch_at.replace(tzinfo=timezone.utc)

    opens_at  = sch_at - timedelta(minutes=30)
    closes_at = sch_at + timedelta(minutes=session.duration_minutes + 15)
    if now < opens_at:
        raise HTTPException(
            status_code=400,
            detail="You cannot open that room now.",
        )
    if now > closes_at:
        raise HTTPException(
            status_code=400,
            detail="This session has already ended.",
        )

    daily = get_daily_client()
    room_name = f"session-{str(session.id)[:8]}"

    # Calculate expiry: session end + 15 min buffer
    exp_secs = max(
        7200,
        int((sch_at + timedelta(minutes=session.duration_minutes + 30) - now).total_seconds()),
    )

    room = daily.get_or_create_room(room_name, exp_seconds=exp_secs)
    room_url = room.get("url", "")

    # Persist the room URL on the session
    if not session.daily_room_name:
        session.daily_room_name = room_name
        session.daily_room_url  = room_url
        session.videocall_url   = room_url   # legacy field
        db.commit()

    # Notify the other participant via the chat system so the student / tutor
    # knows the call is live. We deliberately reuse the existing Message table
    # rather than ship push notifications — it works on every platform we
    # already support and the recipient sees it on their next inbox poll +
    # bottom-nav badge tick.
    try:
        from app.models.message import Message as ChatMessage
        teacher = db.query(Teacher).filter(Teacher.id == session.teacher_id).first()
        student = db.query(Student).filter(Student.id == session.student_id).first()
        teacher_user_id = teacher.user_id if teacher else None
        student_user_id = student.user_id if student else None

        recipient_id = None
        if str(current_user.id) == str(teacher_user_id):
            recipient_id = student_user_id
        elif str(current_user.id) == str(student_user_id):
            recipient_id = teacher_user_id

        if recipient_id:
            # Don't spam the inbox — only send when no invitation has been
            # sent for this room URL yet (within the last 30 min window).
            already = (
                db.query(ChatMessage)
                .filter(
                    ChatMessage.sender_id == current_user.id,
                    ChatMessage.receiver_id == recipient_id,
                    ChatMessage.content.like("%video call%"),
                    ChatMessage.created_at >= now - timedelta(minutes=30),
                )
                .first()
            )
            if not already:
                inviter_label = (
                    current_user.full_name or "Your tutor / student"
                )
                invite_body = (
                    f"{inviter_label} opened the video call for your lesson. "
                    f"Join here: {room_url}"
                )
                db.add(
                    ChatMessage(
                        sender_id=current_user.id,
                        receiver_id=recipient_id,
                        content=invite_body,
                    )
                )
                db.commit()
    except Exception:
        # Best-effort: invitation failure must never break opening the room.
        db.rollback()

    return DailyRoomOut(room_name=room_name, url=room_url, session_id=session_id)


@router.post(
    "/{session_id}/daily/token",
    response_model=DailyTokenOut,
    summary="Get a Daily.co meeting token for the current user",
)
def get_daily_token(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns a short-lived Daily meeting token for this participant.

    React Native joins with both the room URL and this token:
        await call.join({ url: roomUrl, token: meetingToken });
    """
    session = _get_accessible_session(session_id, current_user, db)
    if _has_pending_reschedule(db, session.id):
        raise HTTPException(
            status_code=400,
            detail="This session was rescheduled — the video room is closed.",
        )
    _check_session_window(session)

    if not session.daily_room_name:
        raise HTTPException(
            status_code=400,
            detail="Daily room not created yet. Call POST /daily/room first.",
        )

    # Determine if this user is the room owner (teacher)
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    is_owner = teacher is not None and str(teacher.id) == str(session.teacher_id)

    # Build a tight time window:
    #   nbf  = session start - 30 min  (matches room creation window)
    #   exp  = session end  + 15 min   (token expires shortly after session ends)
    now    = datetime.now(timezone.utc)
    sch_at = session.scheduled_at
    if sch_at.tzinfo is None:
        sch_at = sch_at.replace(tzinfo=timezone.utc)

    session_end   = sch_at + timedelta(minutes=session.duration_minutes)
    nbf_delta     = int((sch_at - timedelta(minutes=30) - now).total_seconds())
    exp_delta     = max(900, int((session_end + timedelta(minutes=15) - now).total_seconds()))

    daily  = get_daily_client()
    token  = daily.create_meeting_token(
        room_name   = session.daily_room_name,
        user_id     = str(current_user.id),
        user_name   = current_user.full_name,
        is_owner    = is_owner,
        exp_seconds = exp_delta,
        nbf_seconds = max(nbf_delta, -1800),  # clamp: allow up to 30 min early
    )
    return DailyTokenOut(
        token=token,
        room_url=session.daily_room_url or "",
        session_id=session_id,
    )


@router.post("/{session_id}/daily/end", summary="Tutor ends the Daily room for both participants")
def end_daily_room(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_accessible_session(session_id, current_user, db)
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher or str(teacher.id) != str(session.teacher_id):
        raise HTTPException(status_code=403, detail="Only the tutor can end the room for everyone.")
    if session.status != "confirmed":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot finish a session with status '{session.status}'.",
        )
    if not session.daily_room_name:
        raise HTTPException(
            status_code=409,
            detail="Daily room was not opened for this session.",
        )

    now = datetime.now(timezone.utc)
    sch_at = session.scheduled_at
    if sch_at is not None:
        if sch_at.tzinfo is None:
            sch_at = sch_at.replace(tzinfo=timezone.utc)
        if now < sch_at - timedelta(minutes=30):
            raise HTTPException(
                status_code=400,
                detail="The video room can only be ended inside the call window.",
            )

    room_closed = False
    if session.daily_room_name:
        try:
            get_daily_client().delete_room(session.daily_room_name)
            room_closed = True
        except HTTPException:
            room_closed = False

    session.status = "completed"
    db.commit()
    return {
        "message": "Session finished for both participants.",
        "session_id": session_id,
        "room_closed": room_closed,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_accessible_session(
    session_id: str,
    current_user: User,
    db: Session,
    allow_pending: bool = False,
) -> BookingSession:
    """Load session and verify current_user is teacher or student of it."""
    session = db.query(BookingSession).filter(BookingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    allowed_statuses = ("pending", "confirmed", "completed") if allow_pending else ("confirmed", "completed")
    if session.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Session is not yet confirmed.")

    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    student = db.query(Student).filter(Student.user_id == current_user.id).first()

    user_is_teacher = teacher and str(teacher.id) == str(session.teacher_id)
    user_is_student = student and str(student.id) == str(session.student_id)

    if not (user_is_teacher or user_is_student):
        raise HTTPException(
            status_code=403,
            detail="You are not a participant in this session.",
        )
    return session


def _check_session_window(session: BookingSession) -> None:
    """Raise 400 if the call window is not open (±15 min around session)."""
    now    = datetime.now(timezone.utc)
    sch_at = session.scheduled_at
    if sch_at.tzinfo is None:
        sch_at = sch_at.replace(tzinfo=timezone.utc)

    opens_at  = sch_at - timedelta(minutes=30)
    closes_at = sch_at + timedelta(minutes=session.duration_minutes + 15)

    if now < opens_at:
        minutes_left = int((opens_at - now).total_seconds() / 60)
        raise HTTPException(
            status_code=400,
            detail=f"Video call opens 30 min before the session. Available in {minutes_left} min.",
        )
    if now > closes_at:
        raise HTTPException(status_code=400, detail="This session has already ended.")


def _has_pending_reschedule(db: Session, session_id) -> bool:
    """True if a reschedule request is waiting to be accepted/rejected — used
    to close the live Daily room the moment either side requests a change."""
    from app.models.session import RescheduleRequest
    return (
        db.query(RescheduleRequest)
        .filter(
            RescheduleRequest.session_id == session_id,
            RescheduleRequest.status == "pending",
        )
        .first()
        is not None
    )
