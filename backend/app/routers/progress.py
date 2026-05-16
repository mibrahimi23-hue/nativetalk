from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from database import get_db
from models.student import Student
from models.session import Session as BookingSession, SessionAttendance
from models.payment import CoursePayment
from models.review import Review
from models.language import Language

router = APIRouter()

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


@router.get("/student/{student_id}")
def get_student_progress(
    student_id: str,
    db: DBSession = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found!")

    completed_sessions = db.query(BookingSession).filter(
        and_(
            BookingSession.student_id == student_id,
            BookingSession.status == "completed"
        )
    ).all()

    total_hours = sum(
        s.duration_minutes / 60 for s in completed_sessions
    )

    total_attendance = db.query(SessionAttendance).filter(
        SessionAttendance.student_id == student_id
    ).count()

    absences = db.query(SessionAttendance).filter(
        and_(
            SessionAttendance.student_id == student_id,
            SessionAttendance.was_present == False
        )
    ).count()

    absence_percent = round((absences / total_attendance * 100), 1) if total_attendance > 0 else 0


    course_payments = db.query(CoursePayment).filter(
        CoursePayment.student_id == student_id
    ).all()

    total_spent = sum(float(cp.amount_paid) for cp in course_payments)

   
    reviews_received = db.query(Review).filter(
        and_(
            Review.student_id == student_id,
            Review.role == "teacher"
        )
    ).all()
    avg_rating = round(
        sum(r.rating for r in reviews_received) / len(reviews_received), 2
    ) if reviews_received else 0

    levels_progress = []
    for cp in course_payments:
        language = db.query(Language).filter(Language.id == cp.language_id).first()
        levels_progress.append({
            "language":    language.name if language else "Unknown",
            "level":       cp.level,
            "total_hours": cp.total_hours,
            "amount_paid": float(cp.amount_paid),
            "amount_left": float(cp.amount_left),
            "status":      cp.status,
            "progress_percent": round(
                (float(cp.amount_paid) / float(cp.total_amount) * 100), 1
            ) if float(cp.total_amount) > 0 else 0
        })

    return {
        "student_id":       str(student.id),
        "current_level":    student.current_level,
        "total_sessions":   len(completed_sessions),
        "total_hours":      round(total_hours, 1),
        "absence_percent":  absence_percent,
        "total_spent":      round(total_spent, 2),
        "avg_rating_from_teachers": avg_rating,
        "reschedule_count": student.reschedule_count,
        "courses":          levels_progress
    }