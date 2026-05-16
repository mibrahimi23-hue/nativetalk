
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from app.db.session import get_db
from app.models.session import Session as BookingSession
from app.models.teacher import Teacher
from app.models.student import Student
from app.models.users import User
from datetime import datetime, timezone, timedelta

router = APIRouter()


@router.get("/{session_id}")
def get_videocall(
    session_id: str,
    user_id:    str,
    db:         DBSession = Depends(get_db)
):
    """
    Get the videocall URL for a session.
    Only the teacher and student of that session can access it.
    Only available 15 minutes before the session starts.
    """
    session = db.query(BookingSession).filter(
        BookingSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found!")

    if session.status not in ["confirmed", "completed"]:
        raise HTTPException(
            status_code=400,
            detail="Session is not confirmed yet!"
        )

    # Check user is the teacher or student of this session
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found!")

    if user.role == "teacher":
        teacher = db.query(Teacher).filter(Teacher.user_id == user_id).first()
        if not teacher or str(teacher.id) != str(session.teacher_id):
            raise HTTPException(
                status_code=403,
                detail="You are not the teacher of this session!"
            )
    elif user.role == "student":
        student = db.query(Student).filter(Student.user_id == user_id).first()
        if not student or str(student.id) != str(session.student_id):
            raise HTTPException(
                status_code=403,
                detail="You are not the student of this session!"
            )
    else:
        raise HTTPException(status_code=403, detail="Access denied!")

    now        = datetime.now(timezone.utc)
    opens_at   = session.scheduled_at - timedelta(minutes=15)
    closes_at  = session.scheduled_at + timedelta(minutes=session.duration_minutes + 15)

    if now < opens_at:
        minutes_left = int((opens_at - now).total_seconds() / 60)
        raise HTTPException(
            status_code=400,
            detail=f"Videocall opens 15 minutes before the session. Available in {minutes_left} minutes!"
        )

    if now > closes_at:
        raise HTTPException(
            status_code=400,
            detail="This session has already ended!"
        )

    return {
        "session_id":       str(session.id),
        "videocall_url":    session.videocall_url,
        "scheduled_at":     str(session.scheduled_at),
        "duration_minutes": session.duration_minutes,
        "opens_at":         str(opens_at),
        "closes_at":        str(closes_at),
        "status":           session.status
    }