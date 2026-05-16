from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from app.db.session import get_db
from app.models.session import Session as BookingSession, RescheduleRequest
from app.models.student import Student
from app.models.teacher import AvailabilitySlot, Teacher
from app.models.payment import CoursePayment
from app.models.suspension import Suspension
from app.models.users import User
from app.services.timezone import to_utc, is_valid_timezone
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
import uuid
import pytz

# Tutors / students must request reschedules at least this far ahead of the
# lesson's scheduled start. Matches the policy in the wireframe note that the
# action must happen "before the day of the lesson".
RESCHEDULE_DEADLINE = timedelta(hours=24)

router = APIRouter()


class RescheduleCreate(BaseModel):
    session_id:       str
    requested_by:     str      
    new_time:         datetime
    user_timezone:    str      
    reason:           str


def _matches_teacher_availability(
    db: DBSession,
    session: BookingSession,
    new_time_utc: datetime,
) -> bool:
    if new_time_utc.tzinfo is None:
        new_time_utc = new_time_utc.replace(tzinfo=timezone.utc)
    duration = timedelta(minutes=session.duration_minutes or 60)

    slots = (
        db.query(AvailabilitySlot)
        .filter(
            AvailabilitySlot.teacher_id == session.teacher_id,
            AvailabilitySlot.is_active == True,  # noqa: E712
        )
        .all()
    )
    for slot in slots:
        if slot.timezone not in pytz.all_timezones_set:
            continue
        tz = pytz.timezone(slot.timezone)
        local_start = new_time_utc.astimezone(tz)
        local_end = (new_time_utc + duration).astimezone(tz)
        if local_start.date() != local_end.date():
            continue
        if local_start.weekday() != int(slot.day_of_week):
            continue
        if local_start.time() >= slot.start_time and local_end.time() <= slot.end_time:
            return True
    return False


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

    # The tutor-didn't-join flow flips the session to `no_show`. Accepting a
    # reschedule should resurrect it as a confirmed booking on the new time
    # (handled in /accept), so it must remain reschedulable here even after
    # the no-show flag is set.
    user = db.query(User).filter(User.id == data.requested_by).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found!")

    # Deadline guard — once we're within 24h of the lesson, neither side can
    # request a reschedule. Keeps the schedule predictable on the day of.
    # Exception: a tutor no-show always lets the student reschedule, even
    # when the original start time is past — they shouldn't be punished for
    # the tutor's absence.
    if session.status != "no_show":
        now = datetime.now(timezone.utc)
        scheduled_at = session.scheduled_at
        if scheduled_at is not None:
            if scheduled_at.tzinfo is None:
                scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
            if now > scheduled_at - RESCHEDULE_DEADLINE:
                raise HTTPException(
                    status_code=400,
                    detail="Reschedules must be requested at least 24 hours before "
                           "the lesson starts.",
                )

    # Once a tutor has already rescheduled this session, they can't reschedule
    # it again. Students remain subject to the broader 5-reschedule limit
    # enforced by check_and_suspend below.
    if user.role == "teacher" and getattr(session, "rescheduled", False):
        raise HTTPException(
            status_code=400,
            detail="This lesson has already been rescheduled once. Contact "
                   "the student directly to coordinate further changes.",
        )

    if user.role == "student":
        student = db.query(Student).filter(
            Student.user_id == data.requested_by
        ).first()
        if student:
            check_and_suspend(student, session, db)

    new_time_utc = to_utc(data.new_time, data.user_timezone)

    if not _matches_teacher_availability(db, session, new_time_utc):
        raise HTTPException(
            status_code=400,
            detail="Choose a time from the tutor's availability.",
        )

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

    # Apply the new time IMMEDIATELY so both dashboards show the rescheduled
    # date as the lesson's actual date — no separate "tutor accepts" step.
    # We still write a RescheduleRequest row (status="accepted") so the
    # 5-reschedule audit / suspension rule keeps working, and so admins
    # can see the history of changes per session.
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

    # Move the session itself to the new date.
    session.scheduled_at = new_time_utc
    if session.status == "no_show":
        # Resurrect a previously no-show booking as a regular confirmed
        # lesson on the new time.
        session.status = "confirmed"
    # The room (if any) was tied to the *old* time, so wipe it — the dashboard
    # auto-fetcher will re-create a fresh Daily room within 30 min of the
    # new scheduled time, and the previous URL/name can't be re-used because
    # its expiry was set based on the old slot.
    session.daily_room_name = None
    session.daily_room_url = None
    session.videocall_url = None
    # `rescheduled` is kept off because there's nothing pending any more —
    # the move has already been applied.
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
    # A reschedule born out of a tutor no-show should resurrect the booking
    # as a normal confirmed lesson, otherwise it would stay stuck in
    # "no_show" forever and the videocall room wouldn't be openable.
    if session.status == "no_show":
        session.status = "confirmed"
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
