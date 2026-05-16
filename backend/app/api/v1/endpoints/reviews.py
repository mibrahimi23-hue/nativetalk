"""
Review endpoints.

Both teacher and student can leave one review per session after it completes.
Payment is released once both reviews are submitted (or auto-released after 48h).
"""
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.message import Message
from app.models.payment import CoursePayment, Payment
from app.models.review import Review
from app.models.session import Session as BookingSession
from app.models.student import Student
from app.models.teacher import Teacher
from app.models.users import User
from app.schemas.review import ReviewCreate, ReviewOut

router = APIRouter(prefix="/reviews", tags=["Reviews"])


@router.post("/", response_model=ReviewOut, status_code=201, summary="Submit a session review")
def create_review(
    body: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    React Native calls this after a session completes.

    Request:
        {
          "session_id": "uuid",
          "role": "student",      ← who is writing (student or teacher)
          "rating": 5,
          "comment": "Great lesson!"
        }

    Releasing payment:
      After both parties submit, the payment record is automatically
      created and the session's payment_released flag is set to true.
    """
    session = db.query(BookingSession).filter(BookingSession.id == body.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.status != "completed":
        raise HTTPException(status_code=400, detail="Session must be completed before reviewing.")

    if not (1 <= body.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be 1–5.")

    # Determine reviewer identity
    if body.role == "student":
        student = db.query(Student).filter(Student.user_id == current_user.id).first()
        if not student or str(student.id) != str(session.student_id):
            raise HTTPException(status_code=403, detail="You are not the student of this session.")
        if session.student_review_done:
            raise HTTPException(status_code=400, detail="You have already reviewed this session.")
        session.student_review_done = True
    elif body.role == "teacher":
        teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
        if not teacher or str(teacher.id) != str(session.teacher_id):
            raise HTTPException(status_code=403, detail="You are not the teacher of this session.")
        if session.teacher_review_done:
            raise HTTPException(status_code=400, detail="You have already reviewed this session.")
        student = db.query(Student).filter(Student.id == session.student_id).first()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found for this session.")
        session.teacher_review_done = True
    else:
        raise HTTPException(status_code=400, detail="role must be 'student' or 'teacher'.")

    review = Review(
        id         = uuid.uuid4(),
        session_id = body.session_id,
        teacher_id = session.teacher_id,
        student_id = session.student_id,
        written_by = current_user.id,
        role       = body.role,
        rating     = body.rating,
        comment    = body.comment,
    )
    db.add(review)

    if body.role == "teacher":
        db.add(Message(
            id=uuid.uuid4(),
            sender_id=current_user.id,
            receiver_id=student.user_id,
            content=(
                "Your tutor sent feedback for your completed lesson: "
                f"{body.comment or 'No written comment.'}"
            ),
        ))

    # Release payment if both parties reviewed
    if session.teacher_review_done and session.student_review_done and not session.payment_released:
        _release_payment(db, session)

    db.commit()
    db.refresh(review)
    # Build the response by hand — the schema declares UUID columns as `str`
    # and Pydantic v2 won't auto-coerce SQLAlchemy UUID values, which would
    # otherwise raise a ResponseValidationError on the 201 response.
    return ReviewOut(
        id         = str(review.id),
        session_id = str(review.session_id),
        teacher_id = str(review.teacher_id),
        student_id = str(review.student_id),
        role       = review.role,
        rating     = review.rating,
        comment    = review.comment,
    )


def _review_to_dict(r: Review, db: Session) -> dict:
    """Serialize a review and resolve the reviewer's display name for the UI."""
    reviewer = db.query(User).filter(User.id == r.written_by).first()
    return {
        "id":             str(r.id),
        "session_id":     str(r.session_id),
        "teacher_id":     str(r.teacher_id),
        "student_id":     str(r.student_id),
        "role":           r.role,
        "rating":         r.rating,
        "comment":        r.comment,
        "created_at":     str(r.created_at) if r.created_at else None,
        # The reviewer's *user_id*, surfaced so the UI can navigate to /chat
        # with the right peer when the tutor taps "Message" on a review card.
        "reviewer_id":    str(r.written_by) if r.written_by else None,
        "reviewer_name":  reviewer.full_name if reviewer else None,
        "reviewer_photo": reviewer.profile_photo if reviewer else None,
    }


@router.get(
    "/session/{session_id}",
    summary="Get reviews for a session",
)
def get_session_reviews(session_id: str, db: Session = Depends(get_db)):
    reviews = db.query(Review).filter(Review.session_id == session_id).all()
    return [_review_to_dict(r, db) for r in reviews]


@router.get(
    "/teacher/{teacher_id}",
    summary="Get all reviews for a teacher",
)
def get_teacher_reviews(teacher_id: str, db: Session = Depends(get_db)):
    reviews = (
        db.query(Review)
        .filter(Review.teacher_id == teacher_id, Review.role == "student")
        .order_by(Review.created_at.desc())
        .all()
    )
    return [_review_to_dict(r, db) for r in reviews]


@router.get(
    "/student/{student_id}",
    summary="Get all reviews a student has received from tutors",
)
def get_student_reviews(student_id: str, db: Session = Depends(get_db)):
    """
    Returns every review written *about* this student. Each row's `role` is
    "teacher" because tutors are the authors. Used by the student-side
    "My Reviews" / "End of lesson" screens so a student can see how their
    tutors graded them after each session.
    """
    reviews = (
        db.query(Review)
        .filter(Review.student_id == student_id, Review.role == "teacher")
        .order_by(Review.created_at.desc())
        .all()
    )
    return [_review_to_dict(r, db) for r in reviews]


# ── Helper ────────────────────────────────────────────────────────────────────

def _release_payment(db: Session, session: BookingSession) -> None:
    course_payment = db.query(CoursePayment).filter(
        CoursePayment.id == session.course_payment_id
    ).first()
    if not course_payment:
        return

    existing = db.query(Payment).filter(Payment.session_id == session.id).first()
    if existing:
        session.payment_released = True
        return

    amount         = round(float(course_payment.price_per_hour) * (session.duration_minutes / 60), 2)
    platform_fee   = round(amount * 0.10, 2)
    teacher_payout = round(amount - platform_fee, 2)

    db.add(Payment(
        id                = uuid.uuid4(),
        session_id        = session.id,
        course_payment_id = course_payment.id,
        amount            = amount,
        platform_fee      = platform_fee,
        teacher_payout    = teacher_payout,
        both_reviewed     = True,
        status            = "paid",
    ))
    session.payment_released = True
