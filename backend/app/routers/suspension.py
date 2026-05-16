from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_, func
from database import get_db
from models.suspension import Suspension, TeacherNoshow
from models.session import Session as BookingSession, SessionAttendance
from models.student import Student
from models.teacher import Teacher
from models.review import Review, ReviewFlag
from models.users import User
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

router = APIRouter()


class NoshowCreate(BaseModel):
    teacher_id: str
    session_id: str
    notified:   bool


def check_student_absences(student_id: str, db: DBSession):
    total = db.query(SessionAttendance).filter(
        SessionAttendance.student_id == student_id
    ).count()

    if total == 0:
        return

    absences = db.query(SessionAttendance).filter(
        and_(
            SessionAttendance.student_id == student_id,
            SessionAttendance.was_present == False
        )
    ).count()

    absence_percent = (absences / total) * 100

    if absence_percent > 60:
        student = db.query(Student).filter(Student.id == student_id).first()

        already = db.query(Suspension).filter(
            and_(
                Suspension.student_id == student_id,
                Suspension.reason == "absence_limit",
                Suspension.is_active == True
            )
        ).first()

        if not already:
            suspension = Suspension(
                id=uuid.uuid4(),
                user_id=student.user_id,
                teacher_id=None,
                student_id=student.id,
                role="student",
                reason="absence_limit",
                no_refund=False,
                is_active=True,
                notes=f"Suspended automatically! Absesnces: {absence_percent:.1f}%"
            )
            db.add(suspension)
            db.commit()
            raise HTTPException(
                status_code=403,
                detail=f"Student suspended! Absences: {absence_percent:.1f}%"
            )


def check_teacher_noshows(teacher_id: str, db: DBSession):
    noshows = db.query(TeacherNoshow).filter(
        and_(
            TeacherNoshow.teacher_id == teacher_id,
            TeacherNoshow.notified == False
        )
    ).count()

    if noshows >= 3:
        teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()

        already = db.query(Suspension).filter(
            and_(
                Suspension.teacher_id == teacher_id,
                Suspension.reason == "no_show_limit",
                Suspension.is_active == True
            )
        ).first()

        if not already:
            suspension = Suspension(
                id=uuid.uuid4(),
                user_id=teacher.user_id,
                teacher_id=teacher.id,
                student_id=None,
                role="teacher",
                reason="no_show_limit",
                no_refund=False,
                is_active=True,
                notes=f"Suspended automatically! No-show without notification: {noshows} times"
            )
            db.add(suspension)
            db.commit()
            raise HTTPException(
                status_code=403,
                detail=f"Teacher suspended! No-show {noshows} times without notification"
            )


def check_negative_reviews(user_id: str, role: str, db: DBSession):
    if role == "teacher":
        from models.session import Session as BookingSession
        teacher = db.query(Teacher).filter(Teacher.user_id == user_id).first()
        if not teacher:
            return

        reviews = db.query(Review).filter(
            and_(
                Review.teacher_id == teacher.id,
                Review.role == "student"
            )
        ).all()

        if len(reviews) >= 3:
            avg = sum(r.rating for r in reviews) / len(reviews)
            if avg < 2.0:
                already = db.query(ReviewFlag).filter(
                    and_(
                        ReviewFlag.flagged_user == user_id,
                        ReviewFlag.status == "pending"
                    )
                ).first()
                if not already:
                    flag = ReviewFlag(
                        id=uuid.uuid4(),
                        flagged_user=user_id,
                        flagged_by=user_id,
                        reason=f"Negative automatically reviews! Average rating: {avg:.1f}/5",
                        status="pending"
                    )
                    db.add(flag)
                    db.commit()

    elif role == "student":
        student = db.query(Student).filter(Student.user_id == user_id).first()
        if not student:
            return

        reviews = db.query(Review).filter(
            and_(
                Review.student_id == student.id,
                Review.role == "teacher"
            )
        ).all()

        if len(reviews) >= 3:
            avg = sum(r.rating for r in reviews) / len(reviews)
            if avg < 2.0:
                already = db.query(ReviewFlag).filter(
                    and_(
                        ReviewFlag.flagged_user == user_id,
                        ReviewFlag.status == "pending"
                    )
                ).first()
                if not already:
                    flag = ReviewFlag(
                        id=uuid.uuid4(),
                        flagged_user=user_id,
                        flagged_by=user_id,
                        reason=f"Negative automatically reviews! Average rating: {avg:.1f}/5",
                        status="pending"
                    )
                    db.add(flag)
                    db.commit()


@router.post("/attendance")
def mark_attendance(
    session_id: str,
    student_id: str,
    was_present: bool,
    db: DBSession = Depends(get_db)
):
    session = db.query(BookingSession).filter(
        BookingSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found!")

    existing = db.query(SessionAttendance).filter(
        and_(
            SessionAttendance.session_id == session_id,
            SessionAttendance.student_id == student_id
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Attendance already marked!")

    attendance = SessionAttendance(
        id=uuid.uuid4(),
        session_id=session_id,
        student_id=student_id,
        was_present=was_present
    )
    db.add(attendance)
    db.commit()

    if not was_present:
        check_student_absences(student_id, db)

    return {
        "message":     "Attendance marked!",
        "was_present": was_present
    }


@router.post("/noshow")
def mark_teacher_noshow(
    data: NoshowCreate,
    db: DBSession = Depends(get_db)
):
    session = db.query(BookingSession).filter(
        BookingSession.id == data.session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found!")

    existing = db.query(TeacherNoshow).filter(
        TeacherNoshow.session_id == data.session_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="No-show has already been marked!")

    noshow = TeacherNoshow(
        id=uuid.uuid4(),
        teacher_id=data.teacher_id,
        session_id=data.session_id,
        notified=data.notified
    )
    db.add(noshow)
    session.status = "no_show"
    db.commit()

    if not data.notified:
        check_teacher_noshows(data.teacher_id, db)

    noshows_count = db.query(TeacherNoshow).filter(
        and_(
            TeacherNoshow.teacher_id == data.teacher_id,
            TeacherNoshow.notified == False
        )
    ).count()

    return {
        "message":      "No-show marked!",
        "noshow_count": noshows_count,
        "remaining":    max(0, 3 - noshows_count)
    }


@router.get("/student/{student_id}")
def get_student_suspension_status(
    student_id: str,
    db: DBSession = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found!")

    total    = db.query(SessionAttendance).filter(SessionAttendance.student_id == student_id).count()
    absences = db.query(SessionAttendance).filter(
        and_(SessionAttendance.student_id == student_id, SessionAttendance.was_present == False)
    ).count()

    absence_percent = (absences / total * 100) if total > 0 else 0

    suspension = db.query(Suspension).filter(
        and_(Suspension.student_id == student_id, Suspension.is_active == True)
    ).first()

    flags = db.query(ReviewFlag).filter(
        and_(ReviewFlag.flagged_user == str(student.user_id), ReviewFlag.status == "pending")
    ).count()

    return {
        "student_id":        student_id,
        "total_sessions":    total,
        "absences":          absences,
        "absence_percent":   round(absence_percent, 1),
        "reschedule_count":  student.reschedule_count,
        "is_suspended":      suspension is not None,
        "suspension_reason": suspension.reason if suspension else None,
        "pending_flags":     flags
    }


@router.get("/teacher/{teacher_id}")
def get_teacher_suspension_status(
    teacher_id: str,
    db: DBSession = Depends(get_db)
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")

    noshows = db.query(TeacherNoshow).filter(
        and_(TeacherNoshow.teacher_id == teacher_id, TeacherNoshow.notified == False)
    ).count()

    suspension = db.query(Suspension).filter(
        and_(Suspension.teacher_id == teacher_id, Suspension.is_active == True)
    ).first()

    flags = db.query(ReviewFlag).filter(
        and_(ReviewFlag.flagged_user == str(teacher.user_id), ReviewFlag.status == "pending")
    ).count()

    return {
        "teacher_id":        teacher_id,
        "noshow_count":      noshows,
        "remaining":         max(0, 3 - noshows),
        "is_suspended":      suspension is not None,
        "suspension_reason": suspension.reason if suspension else None,
        "pending_flags":     flags
    }


@router.put("/{suspension_id}/lift")
def lift_suspension(
    suspension_id: str,
    db: DBSession = Depends(get_db)
):
    suspension = db.query(Suspension).filter(Suspension.id == suspension_id).first()
    if not suspension:
        raise HTTPException(status_code=404, detail="Suspended not found!")

    suspension.is_active = False
    suspension.lifted_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Suspension lifted successfully!"}