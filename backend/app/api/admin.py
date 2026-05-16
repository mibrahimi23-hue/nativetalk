from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_, func
from app.db.session import get_db
from app.models.users import User
from app.models.teacher import Teacher
from app.models.student import Student
from app.models.session import Session as BookingSession
from app.models.payment import CoursePayment, Payment, PayPalTransaction
from app.models.review import ReviewFlag
from app.models.suspension import Suspension
from datetime import datetime, timezone, timedelta

router = APIRouter()


@router.get("/dashboard")
def get_admin_dashboard(
    db: DBSession = Depends(get_db)
):
    """Full platform overview for admin."""

    total_teachers = db.query(Teacher).count()
    total_students = db.query(Student).count()

    total_sessions    = db.query(BookingSession).count()
    completed_sessions = db.query(BookingSession).filter(
        BookingSession.status == "completed"
    ).count()
    pending_sessions  = db.query(BookingSession).filter(
        BookingSession.status == "pending"
    ).count()

    total_revenue = (
        db.query(func.sum(PayPalTransaction.amount))
        .filter(PayPalTransaction.paypal_status == "completed")
        .scalar()
        or 0
    )
    platform_earned = db.query(func.sum(Payment.platform_fee)).scalar() or 0
    teacher_payouts = db.query(func.sum(Payment.teacher_payout)).scalar() or 0

    pending_flags = db.query(ReviewFlag).filter(
        ReviewFlag.status == "pending"
    ).count()

    active_suspensions = db.query(Suspension).filter(
        Suspension.is_active == True
    ).count()

    # Overdue sessions (48h no payment release)
    deadline = datetime.now(timezone.utc) - timedelta(hours=48)
    overdue = db.query(BookingSession).filter(
        and_(
            BookingSession.status == "completed",
            BookingSession.payment_released == False,
            BookingSession.scheduled_at <= deadline
        )
    ).count()

    return {
        "platform":   "NativeTalk",
        "checked_at": str(datetime.now(timezone.utc)),
        "users": {
            "total_teachers": total_teachers,
            "total_students":  total_students,
        },
        "sessions": {
            "total":     total_sessions,
            "completed": completed_sessions,
            "pending":   pending_sessions,
            "overdue_payments": overdue
        },
        "financials": {
            "total_revenue":   round(float(total_revenue), 2),
            "platform_earned": round(float(platform_earned), 2),
            "teacher_payouts": round(float(teacher_payouts), 2),
            "currency":        "EUR"
        },
        "alerts": {
            "pending_flags":      pending_flags,
            "active_suspensions": active_suspensions,
            "overdue_payments":   overdue
        }
    }


@router.get("/flags")
def get_pending_flags(
    db: DBSession = Depends(get_db)
):
    flags = db.query(ReviewFlag).filter(
        ReviewFlag.status == "pending"
    ).all()

    return {
        "total_flags": len(flags),
        "flags": [
            {
                "id":           str(f.id),
                "flagged_user": str(f.flagged_user),
                "reason":       f.reason,
                "created_at":   str(f.created_at)
            }
            for f in flags
        ]
    }


@router.put("/flags/{flag_id}/resolve")
def resolve_flag(
    flag_id: str,
    db: DBSession = Depends(get_db)
):
    flag = db.query(ReviewFlag).filter(ReviewFlag.id == flag_id).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found!")

    flag.status      = "resolved"
    flag.reviewed_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Flag resolved!", "flag_id": flag_id}


@router.get("/suspensions")
def get_active_suspensions(
    db: DBSession = Depends(get_db)
):
    suspensions = db.query(Suspension).filter(
        Suspension.is_active == True
    ).all()

    return {
        "total": len(suspensions),
        "suspensions": [
            {
                "id":         str(s.id),
                "user_id":    str(s.user_id),
                "role":       s.role,
                "reason":     s.reason,
                "notes":      s.notes,
                "suspended_at": str(s.suspended_at)
            }
            for s in suspensions
        ]
    }


@router.get("/teachers")
def get_all_teachers(
    db: DBSession = Depends(get_db)
):
    teachers = db.query(Teacher).all()
    result = []
    for t in teachers:
        user = db.query(User).filter(User.id == t.user_id).first()
        result.append({
            "teacher_id":     str(t.id),
            "full_name":      user.full_name,
            "email":          user.email,
            "max_level":      t.max_level,
            "is_verified":    t.is_verified,
            "is_native":      t.is_native,
            "is_certified":   t.is_certified,
            "has_experience": t.has_experience,
            "language_id":    t.language_id
        })
    return {"total": len(result), "teachers": result}


@router.get("/students")
def get_all_students(
    db: DBSession = Depends(get_db)
):
    students = db.query(Student).all()
    result = []
    for s in students:
        user = db.query(User).filter(User.id == s.user_id).first()
        result.append({
            "student_id":    str(s.id),
            "full_name":     user.full_name,
            "email":         user.email,
            "current_level": s.current_level,
            "reschedule_count": s.reschedule_count
        })
    return {"total": len(result), "students": result}
