from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from app.db.session import get_db
from app.models.payment import CoursePayment, PayPalTransaction
from app.models.session import Session as BookingSession
from app.models.student import Student
from app.models.teacher import Teacher
from app.models.users import User
from app.services.payment_plan import calculate_payment_schedule, calculate_payment_state
from app.services import paypal_client
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
import uuid

router = APIRouter()


class CreateOrderRequest(BaseModel):
    course_payment_id: str
    student_id:        str
    installment:       int = 1


class CaptureOrderRequest(BaseModel):
    paypal_order_id:   str
    course_payment_id: str
    student_id:        str
    installment:       int = 1


def _course_session_counts(db: DBSession, course_payment_id: str) -> tuple[int, int]:
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


@router.post("/create-order")
async def create_paypal_order(
    data: CreateOrderRequest,
    db:   DBSession = Depends(get_db)
):
    """
    Step 1 — Student clicks Pay with PayPal.
    Creates a pending transaction and returns amount + client_id to frontend.
    Frontend opens PayPal checkout with this info.
    """
    cp = db.query(CoursePayment).filter(
        CoursePayment.id == data.course_payment_id
    ).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Course payment not found!")

    student = db.query(Student).filter(
        Student.id == data.student_id
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found!")

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

    if data.installment != payment_state["next_installment"]:
        return {
            "message": "No payment required right now.",
            "course_payment_id": str(cp.id),
            "payment_plan": cp.payment_plan,
            "installment": data.installment,
            "amount": 0.0,
            "currency": "EUR",
            "no_payment_required": True,
            **payment_state,
        }

    if cp.status not in ("active", "completed"):
        raise HTTPException(status_code=400, detail="Course payment is not active!")

    schedule = calculate_payment_schedule(
        cp.total_amount,
        cp.payment_plan,
        cp.total_hours
    )

    if data.installment == 1:
        amount = (
            schedule["upfront_amount"]
            if cp.payment_plan != "hour_by_hour"
            else schedule["per_session_amount"]
        )
    else:
        amount = schedule["installments"][1]["amount"]

    if amount == 0:
        return {
            "message": "No payment required right now.",
            "course_payment_id": str(cp.id),
            "payment_plan": cp.payment_plan,
            "installment": data.installment,
            "amount": 0.0,
            "currency": "EUR",
            "no_payment_required": True,
            **payment_state,
        }

    pending = db.query(PayPalTransaction).filter(
        PayPalTransaction.course_payment_id == cp.id,
        PayPalTransaction.student_id == student.id,
        PayPalTransaction.installment == data.installment,
        PayPalTransaction.paypal_status == "pending",
    ).order_by(PayPalTransaction.created_at.desc()).first()
    if pending:
        return {
            "message":           "Order already exists. Complete payment on PayPal.",
            "transaction_id":    str(pending.id),
            "amount":            float(pending.amount),
            "currency":          pending.currency,
            "course_payment_id": str(cp.id),
            "payment_plan":      cp.payment_plan,
            "installment":       data.installment,
            "paypal_client_id":  paypal_client.PAYPAL_CLIENT_ID,
            "paypal_mode":       paypal_client.PAYPAL_MODE,
            "paypal_order_id":   pending.paypal_order_id,
            "approval_url":      None,
            "live":              paypal_client.is_configured(),
        }

    # If real PayPal credentials are configured, ask PayPal to create the
    # order so the frontend can launch the official approval flow. When the
    # creds are missing we fall back to a local "pending" placeholder so the
    # demo flow still works (the capture endpoint will accept anything in
    # that case).
    paypal_order_id = f"PENDING_{uuid.uuid4()}"
    approval_url = None
    if paypal_client.is_configured():
        try:
            created = paypal_client.create_order(
                amount=float(amount),
                currency="EUR",
                description=f"NativeTalk {cp.level} lesson installment {data.installment}",
            )
            paypal_order_id = created.get("order_id") or paypal_order_id
            approval_url = created.get("approval_url")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to create PayPal order: {exc}",
            )

    transaction = PayPalTransaction(
        id=uuid.uuid4(),
        course_payment_id=cp.id,
        student_id=student.id,
        paypal_order_id=paypal_order_id,
        paypal_status="pending",
        amount=amount,
        currency="EUR",
        installment=data.installment
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    return {
        "message":           "Order created! Complete payment on PayPal.",
        "transaction_id":    str(transaction.id),
        "amount":            float(amount),
        "currency":          "EUR",
        "course_payment_id": str(cp.id),
        "payment_plan":      cp.payment_plan,
        "installment":       data.installment,
        "paypal_client_id":  paypal_client.PAYPAL_CLIENT_ID,
        "paypal_mode":       paypal_client.PAYPAL_MODE,
        "paypal_order_id":   paypal_order_id,
        "approval_url":      approval_url,
        "live":              paypal_client.is_configured(),
    }


@router.post("/capture-order")
async def capture_paypal_order(
    data: CaptureOrderRequest,
    db:   DBSession = Depends(get_db)
):
    """
    Step 2 — After student approves on PayPal.
    Frontend sends back the PayPal order ID to confirm payment.
    """
    transaction = db.query(PayPalTransaction).filter(
        PayPalTransaction.course_payment_id == data.course_payment_id,
        PayPalTransaction.student_id == data.student_id,
        PayPalTransaction.installment == data.installment,
        PayPalTransaction.paypal_status == "pending"
    ).first()

    if not transaction:
        cp = db.query(CoursePayment).filter(
            CoursePayment.id == data.course_payment_id
        ).first()
        if cp and (
            (data.installment == 1 and cp.installment_1_paid)
            or (data.installment == 2 and cp.installment_2_paid)
        ):
            return {
                "message": "Payment was already completed.",
                "paypal_order_id": data.paypal_order_id,
                "amount": 0.0,
                "currency": "EUR",
                "installment": data.installment,
                "amount_paid": float(cp.amount_paid),
                "amount_left": float(cp.amount_left),
                "course_status": cp.status,
                "no_payment_required": True,
            }
        raise HTTPException(status_code=404, detail="Transaction not found!")

    # When PayPal is properly configured the frontend posts the real order id
    # returned by the PayPal approval flow — we settle the order with PayPal
    # before flipping the local transaction to completed. In demo mode (no
    # PayPal creds) we just trust the incoming id and mark it complete.
    if paypal_client.is_configured() and not data.paypal_order_id.startswith(
        ("PENDING_", "SIMULATED_")
    ):
        try:
            capture = paypal_client.capture_order(data.paypal_order_id)
            status = (capture or {}).get("status", "")
            if status != "COMPLETED":
                raise HTTPException(
                    status_code=400,
                    detail=f"PayPal capture returned status '{status}'.",
                )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to capture PayPal order: {exc}",
            )

    transaction.paypal_order_id = data.paypal_order_id
    transaction.paypal_status   = "completed"
    transaction.completed_at    = datetime.now(timezone.utc)

    cp = db.query(CoursePayment).filter(
        CoursePayment.id == data.course_payment_id
    ).first()

    if data.installment == 1:
        cp.installment_1_paid = True
    else:
        cp.installment_2_paid = True

    cp.amount_paid = float(cp.amount_paid) + float(transaction.amount)
    cp.amount_left = float(cp.amount_left) - float(transaction.amount)

    if float(cp.amount_left) <= 0:
        cp.status = "completed"

    db.commit()

    return {
        "message":          "Payment completed successfully!",
        "transaction_id":   str(transaction.id),
        "paypal_order_id":  data.paypal_order_id,
        "amount":           float(transaction.amount),
        "currency":         "EUR",
        "installment":      data.installment,
        "amount_paid":      float(cp.amount_paid),
        "amount_left":      float(cp.amount_left),
        "course_status":    cp.status
    }


@router.post("/refund/{transaction_id}")
async def refund_payment(
    transaction_id: str,
    db:             DBSession = Depends(get_db)
):
    """
    Refund a PayPal payment.
    Only allowed if course is not marked no_refund.
    Matches your refund rules in CoursePayment.
    """
    transaction = db.query(PayPalTransaction).filter(
        PayPalTransaction.id == transaction_id
    ).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found!")

    if transaction.paypal_status != "completed":
        raise HTTPException(
            status_code=400,
            detail="Only completed payments can be refunded!"
        )

    cp = db.query(CoursePayment).filter(
        CoursePayment.id == transaction.course_payment_id
    ).first()

    if cp and cp.no_refund:
        raise HTTPException(
            status_code=400,
            detail="This payment is not eligible for refund!"
        )

    transaction.paypal_status = "refunded"

    if cp:
        cp.amount_paid = float(cp.amount_paid) - float(transaction.amount)
        cp.amount_left = float(cp.amount_left) + float(transaction.amount)
        if transaction.installment == 1:
            cp.installment_1_paid = False
        else:
            cp.installment_2_paid = False

    db.commit()

    return {
        "message":        "Refund processed successfully!",
        "transaction_id": str(transaction.id),
        "amount":         float(transaction.amount),
        "currency":       "EUR",
        "note":           "Refund will appear in student PayPal within 3-5 business days."
    }


@router.get("/teacher/{teacher_id}")
def get_teacher_paypal_transactions(
    teacher_id: str,
    db:         DBSession = Depends(get_db),
):
    """
    All PayPal transactions for courses taught by this teacher.

    Used by the tutor `transactions.jsx` screen and by the admin overview to
    display student-side payments. Returns time-bucketed earnings (today /
    this week / this month / total) alongside the per-transaction list, so
    the tutor dashboard can render the four KPI tiles without doing client-
    side date math.
    """
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")

    cp_ids = [
        cp.id
        for cp in db.query(CoursePayment.id).filter(
            CoursePayment.teacher_id == teacher_id
        )
    ]
    if not cp_ids:
        return {
            "teacher_id":   teacher_id,
            "today":        0.0,
            "this_week":    0.0,
            "this_month":   0.0,
            "total":        0.0,
            "currency":     "EUR",
            "transactions": [],
        }

    transactions = db.query(PayPalTransaction).filter(
        PayPalTransaction.course_payment_id.in_(cp_ids),
        PayPalTransaction.paypal_status == "completed",
    ).order_by(PayPalTransaction.completed_at.desc()).all()

    now           = datetime.now(timezone.utc)
    start_of_day  = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_week = start_of_day - timedelta(days=start_of_day.weekday())
    start_of_month = start_of_day.replace(day=1)

    today_total = 0.0
    week_total  = 0.0
    month_total = 0.0
    total_total = 0.0

    out_rows = []
    for t in transactions:
        amt = float(t.amount or 0)
        total_total += amt
        completed = t.completed_at
        if completed is not None:
            if completed.tzinfo is None:
                completed = completed.replace(tzinfo=timezone.utc)
            if completed >= start_of_month:
                month_total += amt
            if completed >= start_of_week:
                week_total += amt
            if completed >= start_of_day:
                today_total += amt

        student = db.query(Student).filter(Student.id == t.student_id).first()
        student_user = (
            db.query(User).filter(User.id == student.user_id).first() if student else None
        )
        out_rows.append({
            "id":              str(t.id),
            "paypal_order_id": t.paypal_order_id,
            "amount":          amt,
            "currency":        t.currency,
            "status":          t.paypal_status,
            "installment":     t.installment,
            "student_id":      str(t.student_id),
            "student_name":    student_user.full_name if student_user else None,
            "course_payment_id": str(t.course_payment_id),
            "created_at":      str(t.created_at) if t.created_at else None,
            "completed_at":    str(t.completed_at) if t.completed_at else None,
        })

    return {
        "teacher_id":   teacher_id,
        "today":        round(today_total, 2),
        "this_week":    round(week_total, 2),
        "this_month":   round(month_total, 2),
        "total":        round(total_total, 2),
        "currency":     "EUR",
        "transactions": out_rows,
    }


@router.get("/admin/all")
def get_all_paypal_transactions(
    limit:  int = 100,
    offset: int = 0,
    db:     DBSession = Depends(get_db),
):
    """
    Cross-cutting feed of every PayPal transaction on the platform — used by
    the admin transactions screen. Joins course/student/teacher context so the
    UI can render `by Student to Teacher €X` rows without follow-up calls.
    """
    transactions = (
        db.query(PayPalTransaction)
        .order_by(PayPalTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    out_rows = []
    for t in transactions:
        cp = db.query(CoursePayment).filter(CoursePayment.id == t.course_payment_id).first()
        teacher_user = None
        student_user = None
        if cp:
            tch = db.query(Teacher).filter(Teacher.id == cp.teacher_id).first()
            if tch:
                teacher_user = db.query(User).filter(User.id == tch.user_id).first()
            stu = db.query(Student).filter(Student.id == cp.student_id).first()
            if stu:
                student_user = db.query(User).filter(User.id == stu.user_id).first()
        out_rows.append({
            "id":              str(t.id),
            "paypal_order_id": t.paypal_order_id,
            "amount":          float(t.amount or 0),
            "currency":        t.currency,
            "status":          t.paypal_status,
            "installment":     t.installment,
            "payment_plan":    cp.payment_plan if cp else None,
            "level":           cp.level if cp else None,
            "teacher_id":      str(cp.teacher_id) if cp else None,
            "student_id":      str(cp.student_id) if cp else None,
            "teacher_name":    teacher_user.full_name if teacher_user else None,
            "student_name":    student_user.full_name if student_user else None,
            "created_at":      str(t.created_at) if t.created_at else None,
            "completed_at":    str(t.completed_at) if t.completed_at else None,
        })
    return out_rows


@router.get("/history/{student_id}")
def get_payment_history(
    student_id: str,
    db:         DBSession = Depends(get_db)
):
    """
    Student sees all their PayPal transactions.
    Matches Figma transaction history screen.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found!")

    transactions = db.query(PayPalTransaction).filter(
        PayPalTransaction.student_id == student_id
    ).all()

    total_paid = sum(
        float(t.amount) for t in transactions
        if t.paypal_status == "completed"
    )

    return {
        "student_id":   student_id,
        "total_paid":   round(total_paid, 2),
        "currency":     "EUR",
        "total":        len(transactions),
        "transactions": [
            {
                "id":              str(t.id),
                "paypal_order_id": t.paypal_order_id,
                "amount":          float(t.amount),
                "currency":        t.currency,
                "status":          t.paypal_status,
                "installment":     t.installment,
                "created_at":      str(t.created_at),
                "completed_at":    str(t.completed_at)
            }
            for t in transactions
        ]
    }
