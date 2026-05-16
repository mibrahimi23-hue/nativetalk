from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from database import get_db
from models.payment import CoursePayment, PayPalTransaction
from models.student import Student
from utils.payment_plan import calculate_payment_schedule
from pydantic import BaseModel
from datetime import datetime, timezone
from dotenv import load_dotenv
import uuid
import os

load_dotenv()

PAYPAL_CLIENT_ID     = os.getenv("PAYPAL_CLIENT_ID", "your-paypal-sandbox-client-id")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "your-paypal-sandbox-secret")
PAYPAL_MODE          = os.getenv("PAYPAL_MODE", "sandbox")
PAYPAL_BASE_URL      = (
    "https://api-m.sandbox.paypal.com"
    if PAYPAL_MODE == "sandbox"
    else "https://api-m.paypal.com"
)

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

    if cp.status != "active":
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
        raise HTTPException(
            status_code=400,
            detail="No payment required for hour_by_hour plan upfront!"
        )

    transaction = PayPalTransaction(
        id=uuid.uuid4(),
        course_payment_id=cp.id,
        student_id=student.id,
        paypal_order_id=f"PENDING_{uuid.uuid4()}",
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
        "paypal_client_id":  PAYPAL_CLIENT_ID,
        "paypal_mode":       PAYPAL_MODE
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
        raise HTTPException(status_code=404, detail="Transaction not found!")

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
        if data.installment == 1:
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