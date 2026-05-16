"""
Payment endpoints.

React Native integration:
  GET /api/v1/payments/course/{id}       → course payment details + refund eligibility
  GET /api/v1/payments/student/{id}      → all payments for a student
  GET /api/v1/payments/teacher/{id}      → all payments for a teacher
  POST /api/v1/payments/course/{id}/plan → update payment plan (student only)
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.payment import CoursePayment, Payment
from app.models.session import Session as BookingSession
from app.models.student import Student
from app.models.suspension import Suspension
from app.models.users import User
from app.services.payment_plan import calculate_payment_state

router = APIRouter(prefix="/payments", tags=["Payments"])

VALID_PLANS = {"hour_by_hour", "50_50", "80_20"}


class SetPaymentPlanRequest(BaseModel):
    payment_plan: str


def _course_session_counts(db: Session, course_payment_id: str) -> tuple[int, int]:
    booked = (
        db.query(BookingSession)
        .filter(
            BookingSession.course_payment_id == course_payment_id,
            BookingSession.status != "cancelled",
        )
        .count()
    )
    completed = (
        db.query(BookingSession)
        .filter(
            BookingSession.course_payment_id == course_payment_id,
            BookingSession.status == "completed",
        )
        .count()
    )
    return booked, completed


@router.get("/course/{course_payment_id}", summary="Get course payment details")
def get_course_payment(
    course_payment_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    cp = db.query(CoursePayment).filter(CoursePayment.id == course_payment_id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Course payment not found.")

    sessions_paid = db.query(Payment).filter(
        and_(Payment.course_payment_id == course_payment_id, Payment.status == "paid")
    ).count()

    suspension = db.query(Suspension).filter(
        and_(Suspension.student_id == cp.student_id, Suspension.is_active == True)
    ).first()

    refund_eligible = not cp.no_refund and (
        not suspension or suspension.reason != "absence_limit"
    )
    booked_sessions, completed_sessions = _course_session_counts(db, course_payment_id)
    payment_state = calculate_payment_state(
        cp.total_amount,
        cp.payment_plan,
        cp.total_hours,
        bool(cp.installment_1_paid),
        bool(cp.installment_2_paid),
        booked_sessions,
        completed_sessions,
    )

    return {
        "course_payment_id": str(cp.id),
        "student_id":        str(cp.student_id),
        "teacher_id":        str(cp.teacher_id),
        "level":             cp.level,
        "total_hours":       cp.total_hours,
        "price_per_hour":    float(cp.price_per_hour),
        "total_amount":      float(cp.total_amount),
        "amount_paid":       float(cp.amount_paid),
        "amount_left":       float(cp.amount_left),
        "sessions_paid":     sessions_paid,
        "no_refund":         cp.no_refund,
        "status":            cp.status,
        "payment_plan":      cp.payment_plan,
        "refund_eligible":   refund_eligible,
        "installment_1_paid": cp.installment_1_paid,
        "installment_2_paid": cp.installment_2_paid,
        **payment_state,
    }


@router.get("/student/{student_id}", summary="Get all course payments for a student")
def get_student_payments(
    student_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    course_payments = db.query(CoursePayment).filter(
        CoursePayment.student_id == student_id
    ).all()

    def _serialize_course_payment(cp: CoursePayment) -> dict:
        booked_sessions, completed_sessions = _course_session_counts(db, str(cp.id))
        payment_state = calculate_payment_state(
            cp.total_amount,
            cp.payment_plan,
            cp.total_hours,
            bool(cp.installment_1_paid),
            bool(cp.installment_2_paid),
            booked_sessions,
            completed_sessions,
        )
        return {
            "id":           str(cp.id),
            "teacher_id":   str(cp.teacher_id),
            "language_id":  cp.language_id,
            "level":        cp.level,
            "total_hours":  cp.total_hours,
            "price_per_hour": float(cp.price_per_hour),
            "total_amount": float(cp.total_amount),
            "amount_paid":  float(cp.amount_paid),
            "amount_left":  float(cp.amount_left),
            "status":       cp.status,
            "payment_plan": cp.payment_plan,
            "installment_1_paid": cp.installment_1_paid,
            "installment_2_paid": cp.installment_2_paid,
            **payment_state,
        }

    return {
        "student_id":  student_id,
        "total_spent": round(sum(float(cp.amount_paid) for cp in course_payments), 2),
        "courses":     len(course_payments),
        "course_payments": [_serialize_course_payment(cp) for cp in course_payments],
    }


@router.post(
    "/course/{course_payment_id}/plan",
    summary="Update payment plan for a course",
)
def set_payment_plan(
    course_payment_id: str,
    body: SetPaymentPlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.payment_plan not in VALID_PLANS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid plan. Must be one of: {', '.join(VALID_PLANS)}",
        )
    cp = db.query(CoursePayment).filter(CoursePayment.id == course_payment_id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Course payment not found.")

    cp.payment_plan = body.payment_plan
    db.commit()
    return {"message": "Payment plan updated.", "payment_plan": body.payment_plan}


@router.get("/teacher/{teacher_id}", summary="Get earnings summary for a teacher")
def get_teacher_earnings(
    teacher_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """
    Returns aggregated teacher_payout totals broken down by period.
    Used by the tutor dashboard Earnings Overview card.
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    payments = (
        db.query(Payment)
        .join(BookingSession, Payment.session_id == BookingSession.id)
        .filter(
            BookingSession.teacher_id == teacher_id,
            Payment.status == "paid",
        )
        .all()
    )

    def _sum(after: datetime | None = None) -> float:
        total = 0.0
        for p in payments:
            ts = p.paid_at or p.created_at
            if ts is not None:
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                if after is not None and ts < after:
                    continue
            total += float(p.teacher_payout)
        return round(total, 2)

    return {
        "teacher_id": teacher_id,
        "today":      _sum(today_start),
        "this_week":  _sum(week_start),
        "this_month": _sum(month_start),
        "total":      _sum(),
    }
