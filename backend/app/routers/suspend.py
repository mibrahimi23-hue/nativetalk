from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from models.suspension import Suspension, TeacherNoshow
from models.session import SessionAttendance
from models.student import Student
from models.teacher import Teacher
from models.review import Review, ReviewFlag
import uuid


def is_user_suspended(user_id: str, db: DBSession) -> bool:
    suspension = db.query(Suspension).filter(
        and_(
            Suspension.user_id == user_id,
            Suspension.is_active == True
        )
    ).first()
    return suspension is not None


def get_student_absence_percent(student_id: str, db: DBSession) -> float:
    total = db.query(SessionAttendance).filter(
        SessionAttendance.student_id == student_id
    ).count()

    if total == 0:
        return 0.0

    absences = db.query(SessionAttendance).filter(
        and_(
            SessionAttendance.student_id == student_id,
            SessionAttendance.was_present == False
        )
    ).count()

    return round((absences / total) * 100, 1)


def auto_suspend_student_absences(student_id: str, db: DBSession) -> bool:
    percent = get_student_absence_percent(student_id, db)

    if percent > 60:
        student = db.query(Student).filter(Student.id == student_id).first()

        already = db.query(Suspension).filter(
            and_(
                Suspension.student_id == student_id,
                Suspension.reason == "absence_limit",
                Suspension.is_active == True
            )
        ).first()

        if not already and student:
            suspension = Suspension(
                id=uuid.uuid4(),
                user_id=student.user_id,
                teacher_id=None,
                student_id=student.id,
                role="student",
                reason="absence_limit",
                no_refund=False,
                is_active=True,
                notes=f"Auto-suspended: absence rate {percent}%"
            )
            db.add(suspension)
            db.commit()
            return True

    return False


def auto_suspend_teacher_noshow(teacher_id: str, db: DBSession) -> bool:
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

        if not already and teacher:
            suspension = Suspension(
                id=uuid.uuid4(),
                user_id=teacher.user_id,
                teacher_id=teacher.id,
                student_id=None,
                role="teacher",
                reason="no_show_limit",
                no_refund=False,
                is_active=True,
                notes=f"Auto-suspended: {noshows} no-shows without notice"
            )
            db.add(suspension)
            db.commit()
            return True

    return False


def auto_flag_negative_reviews(user_id: str, role: str, db: DBSession) -> bool:
    if role == "teacher":
        teacher = db.query(Teacher).filter(Teacher.user_id == user_id).first()
        if not teacher:
            return False

        reviews = db.query(Review).filter(
            and_(Review.teacher_id == teacher.id, Review.role == "student")
        ).all()

    else:
        student = db.query(Student).filter(Student.user_id == user_id).first()
        if not student:
            return False

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
                    reason=f"Auto-flagged: average rating {avg:.1f}/5 (below 2.0)",
                    status="pending"
                )
                db.add(flag)
                db.commit()
                return True

    return False