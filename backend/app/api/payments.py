from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from app.db.session import get_db
from app.models.payment import CoursePayment, Payment
from app.models.student import Student
from app.models.teacher import Teacher
from app.models.suspension import Suspension
from app.services.payment_plan import calculate_payment_schedule
from pydantic import BaseModel
import uuid

router = APIRouter()

VALID_PLANS = {"hour_by_hour", "50_50", "80_20"}


class SetPaymentPlanRequest(BaseModel):
    payment_plan: str


@router.get("/course/{course_payment_id}")
def get_course_payment(
    course_payment_id: str,
    db: DBSession = Depends(get_db)
):
    cp = db.query(CoursePayment).filter(
        CoursePayment.id == course_payment_id
    ).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Payment not found!")

    sessions_paid = db.query(Payment).filter(
        and_(
            Payment.course_payment_id == course_payment_id,
            Payment.status == "paid"
        )
    ).count()

    suspension = db.query(Suspension).filter(
        and_(
            Suspension.student_id == cp.student_id,
            Suspension.is_active == True
        )
    ).first()

    refund_eligible = True
    refund_reason   = None

    if cp.no_refund:
        refund_eligible = False
        refund_reason   = "Reschedule limit reached — no refund per platform rules"
    elif suspension and suspension.reason == "absence_limit":
        refund_eligible = False
        refund_reason   = "Suspended for absences — no refund"

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
        "refund_eligible":   refund_eligible,
        "refund_reason":     refund_reason
    }


@router.get("/student/{student_id}")
def get_student_payments(
    student_id: str,
    db: DBSession = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found!")

    course_payments = db.query(CoursePayment).filter(
        CoursePayment.student_id == student_id
    ).all()

    total_spent = sum(float(cp.amount_paid) for cp in course_payments)

    suspension = db.query(Suspension).filter(
        and_(
            Suspension.student_id == student_id,
            Suspension.is_active == True
        )
    ).first()

    return {
        "student_id":        student_id,
        "total_spent":       round(total_spent, 2),
        "courses":           len(course_payments),
        "is_suspended":      suspension is not None,
        "suspension_reason": suspension.reason if suspension else None,
        "course_payments": [
            {
                "id":           str(cp.id),
                "level":        cp.level,
                "total_hours":  cp.total_hours,
                "total_amount": float(cp.total_amount),
                "amount_paid":  float(cp.amount_paid),
                "amount_left":  float(cp.amount_left),
                "status":       cp.status,
                "no_refund":    cp.no_refund
            }
            for cp in course_payments
        ]
    }


@router.get("/teacher/{teacher_id}")
def get_teacher_payments(
    teacher_id: str,
    db: DBSession = Depends(get_db)
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")

    payments = db.query(Payment).filter(
        Payment.course_payment_id.in_(
            db.query(CoursePayment.id).filter(
                CoursePayment.teacher_id == teacher_id
            )
        )
    ).all()

    total_earned   = sum(float(p.teacher_payout) for p in payments)
    platform_total = sum(float(p.platform_fee) for p in payments)

    return {
        "teacher_id":     teacher_id,
        "total_earned":   round(total_earned, 2),
        "platform_fees":  round(platform_total, 2),
        "total_sessions": len(payments),
        "payments": [
            {
                "id":             str(p.id),
                "session_id":     str(p.session_id),
                "amount":         float(p.amount),
                "platform_fee":   float(p.platform_fee),
                "teacher_payout": float(p.teacher_payout),
                "status":         p.status,
                "paid_at":        str(p.paid_at)
            }
            for p in payments
        ]
    }


@router.get("/session/{session_id}")
def get_session_payment(
    session_id: str,
    db: DBSession = Depends(get_db)
):
    payment = db.query(Payment).filter(
        Payment.session_id == session_id
    ).first()

    if not payment:
        return {
            "session_id": session_id,
            "status":     "not_released",
            "message":    "Payment will release automatically when both reviews are done!"
        }

    return {
        "session_id":     session_id,
        "payment_id":     str(payment.id),
        "amount":         float(payment.amount),
        "platform_fee":   float(payment.platform_fee),
        "teacher_payout": float(payment.teacher_payout),
        "status":         payment.status,
        "paid_at":        str(payment.paid_at)
    }


@router.patch("/course/{course_payment_id}/set-plan")
def set_payment_plan(
    course_payment_id: str,
    body: SetPaymentPlanRequest,
    db: DBSession = Depends(get_db)
):
    if body.payment_plan not in VALID_PLANS:
        raise HTTPException(
            status_code=400,
            detail="Invalid plan. Choose from: hour_by_hour, 50_50, 80_20"
        )

    cp = db.query(CoursePayment).filter(CoursePayment.id == course_payment_id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Course payment not found!")

    if cp.status != "active":
        raise HTTPException(status_code=400, detail="Cannot change plan on a non-active course.")

    cp.payment_plan = body.payment_plan
    db.commit()
    db.refresh(cp)

    schedule = calculate_payment_schedule(cp.total_amount, cp.payment_plan, cp.total_hours)
    return {
        "message":           "Payment plan updated!",
        "course_payment_id": str(cp.id),
        "payment_plan":      cp.payment_plan,
        "schedule":          schedule
    }


@router.get("/course/{course_payment_id}/schedule")
def get_payment_schedule(
    course_payment_id: str,
    db: DBSession = Depends(get_db)
):
    cp = db.query(CoursePayment).filter(CoursePayment.id == course_payment_id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Course payment not found!")

    schedule = calculate_payment_schedule(cp.total_amount, cp.payment_plan, cp.total_hours)
    return {
        "course_payment_id":  str(cp.id),
        "student_id":         str(cp.student_id),
        "teacher_id":         str(cp.teacher_id),
        "total_amount":       float(cp.total_amount),
        "payment_plan":       cp.payment_plan,
        "installment_1_paid": cp.installment_1_paid,
        "installment_2_paid": cp.installment_2_paid,
        "schedule":           schedule
    }


@router.get("/course/{course_payment_id}/checkout")
def get_checkout_summary(
    course_payment_id: str,
    db: DBSession = Depends(get_db)
):
    cp = db.query(CoursePayment).filter(
        CoursePayment.id == course_payment_id
    ).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Course payment not found!")

    schedule = calculate_payment_schedule(
        cp.total_amount,
        cp.payment_plan,
        cp.total_hours
    )

    return {
        "course_payment_id": str(cp.id),
        "student_id":        str(cp.student_id),
        "teacher_id":        str(cp.teacher_id),
        "level":             cp.level,
        "total_hours":       cp.total_hours,
        "total_amount":      float(cp.total_amount),
        "payment_plan":      cp.payment_plan,
        "first_payment_due": schedule["upfront_amount"],
        "schedule":          schedule,
        "status":            cp.status
    }


@router.post("/course/{course_payment_id}/confirm")
def confirm_payment(
    course_payment_id: str,
    db: DBSession = Depends(get_db)
):
    cp = db.query(CoursePayment).filter(
        CoursePayment.id == course_payment_id
    ).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Course payment not found!")

    if cp.status != "active":
        raise HTTPException(
            status_code=400,
            detail="This course payment is not active!"
        )

    if cp.installment_1_paid:
        raise HTTPException(
            status_code=400,
            detail="First payment already confirmed!"
        )

    cp.installment_1_paid = True

    if cp.payment_plan in ["50_50", "80_20"]:
        schedule       = calculate_payment_schedule(
            cp.total_amount, cp.payment_plan, cp.total_hours
        )
        upfront        = schedule["upfront_amount"]
        cp.amount_paid = float(cp.amount_paid) + upfront
        cp.amount_left = float(cp.amount_left) - upfront

    db.commit()

    return {
        "message":            "Payment confirmed!",
        "course_payment_id":  str(cp.id),
        "payment_plan":       cp.payment_plan,
        "installment_1_paid": cp.installment_1_paid,
        "amount_paid":        float(cp.amount_paid),
        "amount_left":        float(cp.amount_left)
    }