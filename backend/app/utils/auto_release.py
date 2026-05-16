from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from app.models.session import Session as BookingSession
from app.models.payment import CoursePayment, Payment
from datetime import datetime, timezone, timedelta
import uuid


def auto_release_overdue_payments(db: DBSession):
    deadline = datetime.now(timezone.utc) - timedelta(hours=48)

    overdue_sessions = db.query(BookingSession).filter(
        and_(
            BookingSession.status == "completed",
            BookingSession.payment_released == False,
            BookingSession.scheduled_at <= deadline
        )
    ).all()

    released_count = 0

    for session in overdue_sessions:
        course_payment = db.query(CoursePayment).filter(
            CoursePayment.id == session.course_payment_id
        ).first()

        if not course_payment:
            continue

        existing_payment = db.query(Payment).filter(
            Payment.session_id == session.id
        ).first()

        if existing_payment:
            session.payment_released = True
            db.commit()
            continue

        price_per_hour = float(course_payment.price_per_hour)
        amount         = round(price_per_hour * (session.duration_minutes / 60), 2)
        platform_fee   = round(amount * 0.10, 2)
        teacher_payout = round(amount - platform_fee, 2)

        payment = Payment(
            id=uuid.uuid4(),
            session_id=session.id,
            course_payment_id=course_payment.id,
            amount=amount,
            platform_fee=platform_fee,
            teacher_payout=teacher_payout,
            both_reviewed=(
                session.teacher_review_done and session.student_review_done
            ),
            status="paid",
            paid_at=datetime.now(timezone.utc)
        )
        db.add(payment)

        session.payment_released    = True
        session.teacher_review_done = True
        session.student_review_done = True

        course_payment.amount_paid = float(course_payment.amount_paid) + amount
        course_payment.amount_left = float(course_payment.amount_left) - amount

        if float(course_payment.amount_left) <= 0:
            course_payment.status = "completed"

        db.commit()
        released_count += 1

    return released_count