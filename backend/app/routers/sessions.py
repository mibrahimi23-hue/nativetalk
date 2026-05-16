from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from database import get_db, SessionLocal
from models.session import Session as BookingSession
from models.teacher import Teacher
from models.student import Student
from models.users import User
from utils.timezone import from_utc, is_valid_timezone
from utils.auto_release import auto_release_overdue_payments  # ← NEW
from datetime import timezone, datetime, timedelta             # ← ADD timedelta
import uuid

router = APIRouter()


@router.get("/overdue")
def get_overdue_sessions(
    db: DBSession = Depends(get_db)
):
    deadline = datetime.now(timezone.utc) - timedelta(hours=48)

    overdue = db.query(BookingSession).filter(
        and_(
            BookingSession.status == "completed",
            BookingSession.payment_released == False,
            BookingSession.scheduled_at <= deadline
        )
    ).all()

    return {
        "total_overdue": len(overdue),
        "deadline":      str(deadline),
        "sessions": [
            {
                "session_id":          str(s.id),
                "teacher_id":          str(s.teacher_id),
                "student_id":          str(s.student_id),
                "level":               s.level,
                "scheduled_at":        str(s.scheduled_at),
                "teacher_review_done": s.teacher_review_done,
                "student_review_done": s.student_review_done,
                "hours_overdue":       round(
                    (datetime.now(timezone.utc) - s.scheduled_at
                ).total_seconds() / 3600, 1)
            }
            for s in overdue
        ]
    }


@router.post("/auto-release")
def trigger_auto_release(
    db: DBSession = Depends(get_db)
):
    released = auto_release_overdue_payments(db)

    return {
        "message":           "Auto-release completed!",
        "sessions_released": released,
        "checked_at":        str(datetime.now(timezone.utc)),
        "rule":              "Sessions older than 48h with unreleased payment were auto-released"
    }
@router.get("/{session_id}")
def get_session(
    session_id: str,
    user_timezone: str = "UTC",
    db: DBSession = Depends(get_db)
):
    if not is_valid_timezone(user_timezone):
        raise HTTPException(status_code=400, detail="Invalid timezone!")

    session = db.query(BookingSession).filter(
        BookingSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found!")

    teacher = db.query(Teacher).filter(
        Teacher.id == session.teacher_id
    ).first()
    teacher_user = db.query(User).filter(
        User.id == teacher.user_id
    ).first()

    student = db.query(Student).filter(
        Student.id == session.student_id
    ).first()
    student_user = db.query(User).filter(
        User.id == student.user_id
    ).first()

    teacher_local = from_utc(session.scheduled_at, teacher_user.timezone)
    student_local = from_utc(session.scheduled_at, student_user.timezone)
    hours_since = (
        datetime.now(timezone.utc) - session.scheduled_at
    ).total_seconds() / 3600

    auto_released = False
    if (
        session.status == "completed" and
        not session.payment_released and
        hours_since >= 48
    ):
        db2 = SessionLocal()
        try:
            released = auto_release_overdue_payments(db2)
            auto_released = released > 0
            db.refresh(session)
        finally:
            db2.close()
    return {
        "session_id":          str(session.id),
        "level":               session.level,
        "duration_minutes":    session.duration_minutes,
        "status":              session.status,
        "videocall_url":       session.videocall_url,
        "rescheduled":         session.rescheduled,
        "teacher_review_done": session.teacher_review_done,
        "student_review_done": session.student_review_done,
        "payment_released":    session.payment_released,
        "auto_released":       auto_released,
        "scheduled_at_utc":    str(session.scheduled_at),
        "teacher_time": {
            "time":     teacher_local.strftime("%Y-%m-%d %H:%M"),
            "timezone": teacher_user.timezone,
        },
        "student_time": {
            "time":     student_local.strftime("%Y-%m-%d %H:%M"),
            "timezone": student_user.timezone,
        },
    }
@router.put("/{session_id}/confirm")
def confirm_session(
    session_id: str,
    teacher_id: str,
    db: DBSession = Depends(get_db)
):
    session = db.query(BookingSession).filter(
        and_(
            BookingSession.id == session_id,
            BookingSession.teacher_id == teacher_id
        )
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found!")

    if session.status != "pending":
        raise HTTPException(status_code=400, detail="This session cannot be confirmed!")

    session.status = "confirmed"
    db.commit()

    return {
        "message":    "Session confirmed!",
        "session_id": session_id,
        "status":     "confirmed"
    }


@router.put("/{session_id}/complete")
def complete_session(
    session_id: str,
    db: DBSession = Depends(get_db)
):
    session = db.query(BookingSession).filter(
        BookingSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found!")

    if session.status != "confirmed":
        raise HTTPException(status_code=400, detail="Only confirmed sessions can be completed!")

    session.status = "completed"
    db.commit()

    return {
        "message":    "Session completed!",
        "session_id": session_id,
        "next_step":  "Both teacher and student can now write a review. Payment auto-releases after 48h if no review is written."
    }
@router.put("/{session_id}/cancel")
def cancel_session(
    session_id: str,
    db: DBSession = Depends(get_db)
):
    session = db.query(BookingSession).filter(
        BookingSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found!")

    if session.status in ["completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="This session cannot be cancelled!")

    session.status = "cancelled"
    db.commit()

    return {"message": "Session cancelled!", "session_id": session_id}