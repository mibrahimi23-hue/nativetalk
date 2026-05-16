from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from app.db.session import get_db
from app.models.review import Review, ReviewFlag
from app.models.session import Session as BookingSession
from app.models.payment import CoursePayment, Payment
from app.models.student import Student
from app.models.teacher import Teacher
from app.models.users import User
from app.models.suspension import Suspension
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

router = APIRouter()


class ReviewCreate(BaseModel):
    session_id: str
    written_by: str   
    rating:     int   
    comment:    str


class ReviewFlagCreate(BaseModel):
    flagged_user: str
    flagged_by:   str
    reason:       str


def release_payment_if_both_reviewed(
    session: BookingSession,
    db: DBSession
):
    if session.teacher_review_done and session.student_review_done:
        session.payment_released = True

        course_payment = db.query(CoursePayment).filter(
            CoursePayment.id == session.course_payment_id
        ).first()

        if course_payment:
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
                both_reviewed=True,
                status="paid",
                paid_at=datetime.now(timezone.utc)
            )
            db.add(payment)

            course_payment.amount_paid = float(course_payment.amount_paid) + amount
            course_payment.amount_left = float(course_payment.amount_left) - amount

            if float(course_payment.amount_left) <= 0:
                course_payment.status = "completed"

        db.commit()
        return True
    return False


def check_negative_reviews_and_flag(user_id: str, role: str, db: DBSession):
    if role == "teacher":
        teacher = db.query(Teacher).filter(Teacher.user_id == user_id).first()
        if not teacher:
            return
        reviews = db.query(Review).filter(
            and_(Review.teacher_id == teacher.id, Review.role == "student")
        ).all()
    else:
        student = db.query(Student).filter(Student.user_id == user_id).first()
        if not student:
            return
        reviews = db.query(Review).filter(
            and_(Review.student_id == student.id, Review.role == "teacher")
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
                    reason=f"Auto-flagged: rating mesatar {avg:.1f}/5 (below 2.0)",
                    status="pending"
                )
                db.add(flag)
                db.commit()


@router.post("/")
def create_review(
    data: ReviewCreate,
    db: DBSession = Depends(get_db)
):
    if not (1 <= data.rating <= 5):
        raise HTTPException(
            status_code=400,
            detail="Rating should be from 1 to 5!"
        )

    session = db.query(BookingSession).filter(
        BookingSession.id == data.session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found!")

    if session.status != "completed":
        raise HTTPException(
            status_code=400,
            detail="You can only write a review after the session is completed.!"
        )

    user = db.query(User).filter(User.id == data.written_by).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found!")

    existing = db.query(Review).filter(
        and_(
            Review.session_id == data.session_id,
            Review.written_by == data.written_by
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="You have already written a review for this session!"
        )

    if user.role == "student":
        student = db.query(Student).filter(
            Student.user_id == data.written_by
        ).first()
        review = Review(
            id=uuid.uuid4(),
            session_id=data.session_id,
            teacher_id=session.teacher_id,
            student_id=student.id,
            written_by=data.written_by,
            role="student",
            rating=data.rating,
            comment=data.comment
        )
        db.add(review)
        session.student_review_done = True

        teacher = db.query(Teacher).filter(
            Teacher.id == session.teacher_id
        ).first()
        check_negative_reviews_and_flag(str(teacher.user_id), "teacher", db)

    elif user.role == "teacher":
        student = db.query(Student).filter(
            Student.id == session.student_id
        ).first()
        review = Review(
            id=uuid.uuid4(),
            session_id=data.session_id,
            teacher_id=session.teacher_id,
            student_id=student.id,
            written_by=data.written_by,
            role="teacher",
            rating=data.rating,
            comment=data.comment
        )
        db.add(review)
        session.teacher_review_done = True

        check_negative_reviews_and_flag(str(student.user_id), "student", db)

    else:
        raise HTTPException(
            status_code=400,
            detail="Only students and teachers can write a review!"
        )

    db.commit()
    db.refresh(review)

    payment_released = release_payment_if_both_reviewed(session, db)

    return {
        "message":          "Review created successfully!",
        "review_id":        str(review.id),
        "rating":           data.rating,
        "payment_released": payment_released,
        "both_reviewed":    session.teacher_review_done and session.student_review_done,
        "next_step":        "Payment released for the teacher!" if payment_released else "Waiting for the other person to review!"
    }


@router.get("/teacher/{teacher_id}")
def get_teacher_reviews(
    teacher_id: str,
    db: DBSession = Depends(get_db)
):
    reviews = db.query(Review).filter(
        and_(
            Review.teacher_id == teacher_id,
            Review.role == "student"
        )
    ).all()

    if not reviews:
        return {
            "teacher_id": teacher_id,
            "reviews":    [],
            "avg_rating": 0,
            "total":      0
        }

    avg_rating = sum(r.rating for r in reviews) / len(reviews)

    return {
        "teacher_id": teacher_id,
        "avg_rating": round(avg_rating, 2),
        "total":      len(reviews),
        "reviews": [
            {
                "id":         str(r.id),
                "rating":     r.rating,
                "comment":    r.comment,
                "created_at": str(r.created_at)
            }
            for r in reviews
        ]
    }


@router.get("/student/{student_id}")
def get_student_reviews(
    student_id: str,
    db: DBSession = Depends(get_db)
):
    reviews = db.query(Review).filter(
        and_(
            Review.student_id == student_id,
            Review.role == "teacher"
        )
    ).all()

    if not reviews:
        return {
            "student_id": student_id,
            "reviews":    [],
            "avg_rating": 0,
            "total":      0
        }

    avg_rating = sum(r.rating for r in reviews) / len(reviews)

    return {
        "student_id": student_id,
        "avg_rating": round(avg_rating, 2),
        "total":      len(reviews),
        "reviews": [
            {
                "id":         str(r.id),
                "rating":     r.rating,
                "comment":    r.comment,
                "created_at": str(r.created_at)
            }
            for r in reviews
        ]
    }


@router.post("/flag")
def flag_review(
    data: ReviewFlagCreate,
    db: DBSession = Depends(get_db)
):
    flag = ReviewFlag(
        id=uuid.uuid4(),
        flagged_user=data.flagged_user,
        flagged_by=data.flagged_by,
        reason=data.reason,
        status="pending"
    )
    db.add(flag)
    db.commit()

    return {
        "message": "Review flagged! Admin will review it.",
        "flag_id": str(flag.id)
    }


@router.get("/flags")
def get_all_flags(
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