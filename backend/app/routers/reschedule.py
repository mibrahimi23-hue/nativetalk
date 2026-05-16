from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from app.db.session import get_db
from app.models.session import Session as BookingSession, RescheduleRequest
from app.models.student import Student
from app.models.teacher import Teacher
from app.models.payment import CoursePayment
from app.models.suspension import Suspension
from app.models.users import User
from utils.timezone import to_utc, is_valid_timezone
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

router = APIRouter()


class RescheduleCreate(BaseModel):
    session_id:       str
    requested_by:     str      
    new_time:         datetime
    user_timezone:    str      
    reason:           str


def check_and_suspend(student: Student, session: BookingSession, db: DBSession):
    if student.reschedule_count >= 5:
        suspension = Suspension(
            id=uuid.uuid4(),
            user_id=student.user_id,
            teacher_id=None,
            student_id=student.id,
            role="student",
            reason="reschedule_limit",
            no_refund=True,
            is_active=True,
            notes="Suspended automatically after 5 reschedules!"
        )
        db.add(suspension)

        course_payment = db.query(CoursePayment).filter(
            CoursePayment.id == session.course_payment_id
        ).first()
        if course_payment:
            course_payment.no_refund = True
            course_payment.status = "suspended"

        db.commit()

        raise HTTPException(
            status_code=403,
            detail="You have been suspended! Reason:You have exceeded the 5 reschedule.No refund!"
        )


@router.post("/")
def request_reschedule(
    data: RescheduleCreate,
    db: DBSession = Depends(get_db)
):
    if not is_valid_timezone(data.user_timezone):
        raise HTTPException(status_code=400, detail="Invalid timezone!")

    session = db.query(BookingSession).filter(
        BookingSession.id == data.session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found!")

    if session.status in ["completed", "cancelled"]:
        raise HTTPException(
            status_code=400,
            detail="This session cannot be rescheduled!"
        )
    user = db.query(User).filter(User.id == data.requested_by).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found!")

    if user.role == "student":
        student = db.query(Student).filter(
            Student.user_id == data.requested_by
        ).first()
        if student:
            check_and_suspend(student, session, db)

    new_time_utc = to_utc(data.new_time, data.user_timezone)

    conflict = db.query(BookingSession).filter(
        and_(
            BookingSession.teacher_id == session.teacher_id,
            BookingSession.status.in_(["pending", "confirmed"]),
            BookingSession.scheduled_at == new_time_utc,
            BookingSession.id != session.id
        )
    ).first()

    if conflict:
        raise HTTPException(
            status_code=400,
            detail="Teacher already has a session at this time!"
        )

    # Apply the new time immediately so both dashboards reflect the move
    # without a separate accept step.
    reschedule = RescheduleRequest(
        id=uuid.uuid4(),
        session_id=data.session_id,
        requested_by=data.requested_by,
        new_time=new_time_utc,
        status="accepted",
        reason=data.reason,
        resolved_at=datetime.now(timezone.utc),
    )
    db.add(reschedule)

    session.scheduled_at = new_time_utc
    if session.status == "no_show":
        session.status = "confirmed"
    session.daily_room_name = None
    session.daily_room_url = None
    session.videocall_url = None
    session.rescheduled = False

    if user.role == "student":
        student = db.query(Student).filter(
            Student.user_id == data.requested_by
        ).first()
        if student:
            student.reschedule_count += 1

    db.commit()
    db.refresh(reschedule)
    db.refresh(session)

    student_obj = db.query(Student).filter(
        Student.id == session.student_id
    ).first()

    return {
        "message": "Session rescheduled.",
        "reschedule": {
            "id":               str(reschedule.id),
            "session_id":       data.session_id,
            "requested_by":     user.role,
            "new_time_utc":     str(new_time_utc),
            "status":           "accepted",
            "reason":           data.reason,
            "reschedule_count": student_obj.reschedule_count if student_obj else 0,
            "remaining":        5 - student_obj.reschedule_count if student_obj else 5,
        },
    }


@router.put("/{reschedule_id}/accept")
def accept_reschedule(
    reschedule_id: str,
    db: DBSession = Depends(get_db)
):
    reschedule = db.query(RescheduleRequest).filter(
        RescheduleRequest.id == reschedule_id
    ).first()

    if not reschedule:
        raise HTTPException(status_code=404, detail="Request not found!")

    if reschedule.status != "pending":
        raise HTTPException(
            status_code=400,
            detail="This request has already been accepted!"
        )

    session = db.query(BookingSession).filter(
        BookingSession.id == reschedule.session_id
    ).first()

    session.scheduled_at = reschedule.new_time
    reschedule.status    = "accepted"
    reschedule.resolved_at = datetime.now(timezone.utc)

    db.commit()

    return {
        "message":    "Reschedule accepted!",
        "new_time":   str(reschedule.new_time),
        "session_id": str(session.id)
    }


@router.put("/{reschedule_id}/reject")
def reject_reschedule(
    reschedule_id: str,
    db: DBSession = Depends(get_db)
):
    reschedule = db.query(RescheduleRequest).filter(
        RescheduleRequest.id == reschedule_id
    ).first()

    if not reschedule:
        raise HTTPException(status_code=404, detail="Request not found!")

    if reschedule.status != "pending":
        raise HTTPException(
            status_code=400,
            detail="This request has already been accepted!"
        )

    reschedule.status     = "rejected"
    reschedule.resolved_at = datetime.now(timezone.utc)

    db.commit()

    return {"message": "Reschedule rejected!"}


@router.get("/session/{session_id}")
def get_reschedules(
    session_id: str,
    db: DBSession = Depends(get_db)
):
    reschedules = db.query(RescheduleRequest).filter(
        RescheduleRequest.session_id == session_id
    ).all()

    return {
        "session_id": session_id,
        "total":      len(reschedules),
        "reschedules": [
            {
                "id":         str(r.id),
                "new_time":   str(r.new_time),
                "status":     r.status,
                "reason":     r.reason,
                "created_at": str(r.created_at)
            }
            for r in reschedules
        ]
    }