"""
Admin-only endpoints.
All routes require role="admin".
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models.session import Session as BookingSession
from app.models.student import Student
from app.models.suspension import Suspension, TeacherNoshow
from app.models.teacher import Teacher
from app.models.users import User
from app.services.auto_release import auto_release_overdue_payments

router = APIRouter(prefix="/admin", tags=["Admin"])


class SuspendRequest(BaseModel):
    user_id:  str
    reason:   str
    notes:    str = ""
    no_refund: bool = False


# ─── Admin exam builder ──────────────────────────────────────────────────────
# The frontend admin-exam-builder screen lets the platform admin author an
# exam (language + level + MCQ questions) and publish it. Once published,
# tutors of that language who do not hold a certificate can take the exam
# to qualify up to that level.

def _delete_user_account(target: User, db: Session) -> str:
    """
    Remove a non-admin account and every dependent row that can block deletion.

    The admin screens use user ids. This helper centralizes the hard-delete
    behavior so both explicit delete and the admin suspend action remove the
    account from the app in the same way.
    """
    if target.role == "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin accounts cannot be deleted from this endpoint.",
        )

    from app.models.certificate import TeacherCertificate
    from app.models.exam import Exam, ExamAnswer, ExamAttempt
    from app.models.material import LessonMaterial
    from app.models.message import Message
    from app.models.payment import CoursePayment, Payment, PayPalTransaction
    from app.models.review import Review, ReviewFlag
    from app.models.session import RescheduleRequest, SessionAttendance
    from app.models.student import StudentLanguage
    from app.models.teacher import AvailabilitySlot, TeacherVerification
    from app.models.users import RefreshToken

    teacher = db.query(Teacher).filter(Teacher.user_id == target.id).first()
    student = db.query(Student).filter(Student.user_id == target.id).first()

    session_filters = []
    if teacher:
        session_filters.append(BookingSession.teacher_id == teacher.id)
    if student:
        session_filters.append(BookingSession.student_id == student.id)

    session_ids = []
    if session_filters:
        session_ids = [
            s.id
            for s in db.query(BookingSession.id).filter(or_(*session_filters)).all()
        ]

    course_payment_filters = []
    if teacher:
        course_payment_filters.append(CoursePayment.teacher_id == teacher.id)
    if student:
        course_payment_filters.append(CoursePayment.student_id == student.id)

    course_payment_ids = []
    if course_payment_filters:
        course_payment_ids = [
            p.id
            for p in db.query(CoursePayment.id)
            .filter(or_(*course_payment_filters))
            .all()
        ]

    if course_payment_ids:
        extra_session_ids = [
            s.id
            for s in db.query(BookingSession.id)
            .filter(BookingSession.course_payment_id.in_(course_payment_ids))
            .all()
        ]
        session_ids = list({*session_ids, *extra_session_ids})

    db.query(Message).filter(
        or_(Message.sender_id == target.id, Message.receiver_id == target.id)
    ).delete(synchronize_session=False)
    db.query(RefreshToken).filter(RefreshToken.user_id == target.id).delete(
        synchronize_session=False,
    )
    db.query(ReviewFlag).filter(
        or_(ReviewFlag.flagged_user == target.id, ReviewFlag.flagged_by == target.id)
    ).delete(synchronize_session=False)
    db.query(Suspension).filter(Suspension.user_id == target.id).delete(
        synchronize_session=False,
    )

    review_filters = [Review.written_by == target.id]
    if teacher:
        review_filters.append(Review.teacher_id == teacher.id)
    if student:
        review_filters.append(Review.student_id == student.id)
    if session_ids:
        review_filters.append(Review.session_id.in_(session_ids))
    db.query(Review).filter(or_(*review_filters)).delete(synchronize_session=False)

    reschedule_filters = [RescheduleRequest.requested_by == target.id]
    if session_ids:
        reschedule_filters.append(RescheduleRequest.session_id.in_(session_ids))
    db.query(RescheduleRequest).filter(or_(*reschedule_filters)).delete(
        synchronize_session=False,
    )

    attendance_filters = []
    if student:
        attendance_filters.append(SessionAttendance.student_id == student.id)
    if session_ids:
        attendance_filters.append(SessionAttendance.session_id.in_(session_ids))
    if attendance_filters:
        db.query(SessionAttendance).filter(or_(*attendance_filters)).delete(
            synchronize_session=False,
        )

    noshow_filters = []
    if teacher:
        noshow_filters.append(TeacherNoshow.teacher_id == teacher.id)
    if session_ids:
        noshow_filters.append(TeacherNoshow.session_id.in_(session_ids))
    if noshow_filters:
        db.query(TeacherNoshow).filter(or_(*noshow_filters)).delete(
            synchronize_session=False,
        )

    payment_filters = []
    if session_ids:
        payment_filters.append(Payment.session_id.in_(session_ids))
    if course_payment_ids:
        payment_filters.append(Payment.course_payment_id.in_(course_payment_ids))
    if payment_filters:
        db.query(Payment).filter(or_(*payment_filters)).delete(
            synchronize_session=False,
        )

    paypal_filters = []
    if student:
        paypal_filters.append(PayPalTransaction.student_id == student.id)
    if course_payment_ids:
        paypal_filters.append(
            PayPalTransaction.course_payment_id.in_(course_payment_ids)
        )
    if paypal_filters:
        db.query(PayPalTransaction).filter(or_(*paypal_filters)).delete(
            synchronize_session=False,
        )

    if session_ids:
        db.query(BookingSession).filter(BookingSession.id.in_(session_ids)).delete(
            synchronize_session=False,
        )
    if course_payment_ids:
        db.query(CoursePayment).filter(CoursePayment.id.in_(course_payment_ids)).delete(
            synchronize_session=False,
        )

    if student:
        db.query(StudentLanguage).filter(StudentLanguage.student_id == student.id).delete(
            synchronize_session=False,
        )
        db.query(Suspension).filter(Suspension.student_id == student.id).delete(
            synchronize_session=False,
        )

    if teacher:
        attempt_ids = [
            a.id
            for a in db.query(ExamAttempt.id)
            .filter(ExamAttempt.teacher_id == teacher.id)
            .all()
        ]
        if attempt_ids:
            db.query(ExamAnswer).filter(ExamAnswer.attempt_id.in_(attempt_ids)).delete(
                synchronize_session=False,
            )
            db.query(ExamAttempt).filter(ExamAttempt.id.in_(attempt_ids)).delete(
                synchronize_session=False,
            )
        db.query(LessonMaterial).filter(LessonMaterial.teacher_id == teacher.id).delete(
            synchronize_session=False,
        )
        db.query(TeacherCertificate).filter(
            TeacherCertificate.teacher_id == teacher.id
        ).delete(synchronize_session=False)
        db.query(TeacherVerification).filter(
            or_(
                TeacherVerification.teacher_id == teacher.id,
                TeacherVerification.verified_by == teacher.id,
            )
        ).delete(synchronize_session=False)
        db.query(AvailabilitySlot).filter(
            AvailabilitySlot.teacher_id == teacher.id
        ).delete(synchronize_session=False)
        db.query(Suspension).filter(Suspension.teacher_id == teacher.id).delete(
            synchronize_session=False,
        )
        db.query(Exam).filter(Exam.created_by == teacher.id).update(
            {Exam.created_by: None}, synchronize_session=False,
        )
    if teacher:
        db.delete(teacher)
    if student:
        db.delete(student)

    email = target.email
    db.delete(target)
    return email


class AdminQuestionPayload(BaseModel):
    question_text:  str
    option_a:       str
    option_b:       str
    option_c:       str
    option_d:       str
    correct_answer: str   # "A" | "B" | "C" | "D"


class AdminExamCreate(BaseModel):
    language_id: int
    level:       str
    title:       str
    questions:   list[AdminQuestionPayload]
    is_active:   bool = True   # publish on create by default


_EXAM_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


@router.post("/exams", summary="Admin: create a new exam with questions")
def admin_create_exam(
    body: AdminExamCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    """
    Admins author exams in the dashboard. Unlike teacher-created exams, the
    admin path doesn't enforce the `has_experience` / max_level checks — admin
    has authority over the full level spectrum.
    """
    from app.models.exam import Exam, ExamQuestion
    from app.models.language import Language
    import uuid as _uuid

    if body.level not in _EXAM_LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid level. Must be one of {_EXAM_LEVELS}.")
    if len(body.questions) < 1:
        raise HTTPException(status_code=400, detail="Exam must have at least 1 question.")

    language = db.query(Language).filter(Language.id == body.language_id).first()
    if not language:
        raise HTTPException(status_code=404, detail="Language not found.")

    for q in body.questions:
        if (q.correct_answer or "").upper() not in {"A", "B", "C", "D"}:
            raise HTTPException(
                status_code=400,
                detail="correct_answer must be one of A, B, C, D.",
            )

    exam = Exam(
        id=_uuid.uuid4(),
        language_id=body.language_id,
        level=body.level,
        title=body.title.strip() or f"{language.name} {body.level} exam",
        created_by=None,
        is_active=bool(body.is_active),
    )
    db.add(exam)
    db.flush()
    for q in body.questions:
        db.add(ExamQuestion(
            id=_uuid.uuid4(),
            exam_id=exam.id,
            question_text=q.question_text.strip(),
            option_a=q.option_a.strip(),
            option_b=q.option_b.strip(),
            option_c=q.option_c.strip(),
            option_d=q.option_d.strip(),
            correct_answer=q.correct_answer.upper(),
        ))
    db.commit()
    db.refresh(exam)

    return {
        "message":        "Exam created.",
        "exam_id":        str(exam.id),
        "title":          exam.title,
        "language":       language.name,
        "language_id":    exam.language_id,
        "level":          exam.level,
        "is_active":      bool(exam.is_active),
        "total_questions": len(body.questions),
    }


@router.get("/exams", summary="Admin: list every exam on the platform")
def admin_list_exams(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    from app.models.exam import Exam
    from app.models.language import Language

    rows = db.query(Exam).order_by(Exam.created_at.desc()).all()
    out = []
    for e in rows:
        lang = db.query(Language).filter(Language.id == e.language_id).first()
        out.append({
            "exam_id":         str(e.id),
            "title":           e.title,
            "language_id":     e.language_id,
            "language":        lang.name if lang else None,
            "level":           e.level,
            "is_active":       bool(e.is_active),
            "total_questions": len(e.questions),
            "created_at":      str(e.created_at) if e.created_at else None,
        })
    return out


@router.get("/exams/{exam_id}", summary="Admin: get one exam with its questions")
def admin_get_exam(
    exam_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    """
    Returns the full exam (including the correct answer for every question)
    so the admin builder can prefill the edit screen. Published exams remain
    editable — the admin can adjust prompts, options or the correct answer
    after publication and the change applies immediately to future attempts.
    """
    from app.models.exam import Exam
    from app.models.language import Language

    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found.")
    language = db.query(Language).filter(Language.id == exam.language_id).first()
    return {
        "exam_id":     str(exam.id),
        "title":       exam.title,
        "language_id": exam.language_id,
        "language":    language.name if language else None,
        "level":       exam.level,
        "is_active":   bool(exam.is_active),
        "created_at":  str(exam.created_at) if exam.created_at else None,
        "total_questions": len(exam.questions),
        "questions": [
            {
                "question_id":    str(q.id),
                "question_text":  q.question_text,
                "option_a":       q.option_a,
                "option_b":       q.option_b,
                "option_c":       q.option_c,
                "option_d":       q.option_d,
                "correct_answer": q.correct_answer,
            }
            for q in exam.questions
        ],
    }


class AdminExamUpdate(BaseModel):
    language_id: int
    level:       str
    title:       str
    questions:   list[AdminQuestionPayload]


@router.put("/exams/{exam_id}", summary="Admin: update an exam and replace its questions")
def admin_update_exam(
    exam_id: str,
    body: AdminExamUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    """
    Overwrites an exam's metadata and questions in one shot. Existing
    questions and any attempt answers tied to them are removed first so we
    don't end up with orphan ExamAnswer rows pointing at deleted questions —
    the alternative (diff'ing question text) is fragile when the admin
    reorders or rewrites prompts.
    """
    from app.models.exam import Exam, ExamQuestion, ExamAttempt, ExamAnswer
    from app.models.language import Language
    import uuid as _uuid

    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found.")

    if body.level not in _EXAM_LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid level. Must be one of {_EXAM_LEVELS}.")
    if len(body.questions) < 1:
        raise HTTPException(status_code=400, detail="Exam must have at least 1 question.")

    language = db.query(Language).filter(Language.id == body.language_id).first()
    if not language:
        raise HTTPException(status_code=404, detail="Language not found.")

    for q in body.questions:
        if (q.correct_answer or "").upper() not in {"A", "B", "C", "D"}:
            raise HTTPException(
                status_code=400,
                detail="correct_answer must be one of A, B, C, D.",
            )

    # Drop old answers + questions for this exam so the new set is the
    # authoritative one. Attempts themselves stay (they preserve score totals)
    # but their per-question answer rows go because the questions they refer
    # to no longer exist.
    old_question_ids = [q.id for q in db.query(ExamQuestion.id).filter(ExamQuestion.exam_id == exam_id).all()]
    if old_question_ids:
        db.query(ExamAnswer).filter(ExamAnswer.question_id.in_(old_question_ids)).delete(
            synchronize_session=False
        )
        db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam_id).delete(
            synchronize_session=False
        )

    exam.language_id = body.language_id
    exam.level       = body.level
    exam.title       = body.title.strip() or f"{language.name} {body.level} exam"
    db.flush()

    for q in body.questions:
        db.add(ExamQuestion(
            id=_uuid.uuid4(),
            exam_id=exam.id,
            question_text=q.question_text.strip(),
            option_a=q.option_a.strip(),
            option_b=q.option_b.strip(),
            option_c=q.option_c.strip(),
            option_d=q.option_d.strip(),
            correct_answer=q.correct_answer.upper(),
        ))
    db.commit()
    db.refresh(exam)

    return {
        "message":         "Exam updated.",
        "exam_id":         str(exam.id),
        "title":           exam.title,
        "language":        language.name,
        "language_id":     exam.language_id,
        "level":           exam.level,
        "is_active":       bool(exam.is_active),
        "total_questions": len(body.questions),
    }


@router.patch("/exams/{exam_id}/publish", summary="Admin: publish an exam")
def admin_publish_exam(
    exam_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    from app.models.exam import Exam
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found.")
    exam.is_active = True
    db.commit()
    return {"message": "Exam published.", "exam_id": exam_id, "is_active": True}


@router.patch("/exams/{exam_id}/unpublish", summary="Admin: unpublish an exam")
def admin_unpublish_exam(
    exam_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    from app.models.exam import Exam
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found.")
    exam.is_active = False
    db.commit()
    return {"message": "Exam unpublished.", "exam_id": exam_id, "is_active": False}


@router.delete("/exams/{exam_id}", summary="Admin: delete an exam and its questions")
def admin_delete_exam(
    exam_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    from app.models.exam import Exam, ExamQuestion, ExamAttempt, ExamAnswer
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found.")
    # Cascade manually — there's no CASCADE on the FK.
    attempt_ids = [a.id for a in db.query(ExamAttempt).filter(ExamAttempt.exam_id == exam_id).all()]
    if attempt_ids:
        db.query(ExamAnswer).filter(ExamAnswer.attempt_id.in_(attempt_ids)).delete(synchronize_session=False)
        db.query(ExamAttempt).filter(ExamAttempt.exam_id == exam_id).delete(synchronize_session=False)
    db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam_id).delete(synchronize_session=False)
    db.delete(exam)
    db.commit()
    return {"message": "Exam deleted.", "exam_id": exam_id}


@router.post("/suspend", summary="Remove a user account through admin suspension")
def suspend_user(
    body: SuspendRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == body.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Eligibility gate for student accounts. Five student reschedules is enough
    # on its own; cancellations still require 0% attendance. Tutors and admins
    # skip this rule.
    if user.role == "student":
        student = db.query(Student).filter(Student.user_id == user.id).first()
        if student:
            total = db.query(BookingSession).filter(
                BookingSession.student_id == student.id
            ).count()
            completed = db.query(BookingSession).filter(
                BookingSession.student_id == student.id,
                BookingSession.status == "completed",
            ).count()
            cancelled = db.query(BookingSession).filter(
                BookingSession.student_id == student.id,
                BookingSession.status == "cancelled",
            ).count()
            attendance = round(completed / total * 100) if total > 0 else 100
            reschedules = student.reschedule_count or 0
        else:
            attendance = 100
            reschedules = 0
            cancelled = 0

        eligible = reschedules >= 5 or (attendance == 0 and cancelled > 0)
        if not eligible:
            if reschedules < 5 and attendance != 0:
                reason = f"has {attendance}% attendance and only {reschedules} reschedules"
            elif reschedules < 5 and cancelled == 0:
                reason = (
                    f"has only {reschedules} reschedules and no cancellations"
                )
            else:
                reason = "does not meet the suspension criteria"
            raise HTTPException(
                status_code=400,
                detail=f"This account cannot be suspended because it {reason}.",
            )

    # Eligibility gate for tutor accounts. A tutor may only be suspended after
    # 3 or more continuous unnoticed absences.
    if user.role == "teacher":
        teacher = db.query(Teacher).filter(Teacher.user_id == user.id).first()
        if teacher:
            absences = db.query(TeacherNoshow).filter(
                TeacherNoshow.teacher_id == teacher.id
            ).count()
        else:
            absences = 0

        if absences < 3:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"This account cannot be suspended because it has only "
                    f"{absences} unnoticed absences (need 3 or more)."
                ),
            )

    # Soft suspension — flag the account as suspended and inactive so they can
    # no longer log in or appear in tutor/student lists, but keep every payment,
    # PayPal transaction, session and review record intact so the admin can
    # still audit the history (and so the student's paid-but-not-rebooked
    # credits are not silently wiped out).
    if user.role == "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin accounts cannot be suspended.",
        )

    import uuid as _uuid

    user.is_suspended = True
    user.is_active = False

    teacher_row = (
        db.query(Teacher).filter(Teacher.user_id == user.id).first()
        if user.role == "teacher"
        else None
    )
    student_row = (
        db.query(Student).filter(Student.user_id == user.id).first()
        if user.role == "student"
        else None
    )

    existing_suspension = (
        db.query(Suspension)
        .filter(
            Suspension.user_id == user.id,
            Suspension.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not existing_suspension:
        db.add(Suspension(
            id=_uuid.uuid4(),
            user_id=user.id,
            teacher_id=teacher_row.id if teacher_row else None,
            student_id=student_row.id if student_row else None,
            role=user.role,
            reason=body.reason or "admin_action",
            no_refund=body.no_refund,
            notes=body.notes or "",
            is_active=True,
        ))

    # Cancel any pending/confirmed sessions so neither side keeps trying to
    # use them, but DO NOT delete the rows — they're part of the audit trail.
    session_filters = []
    if teacher_row:
        session_filters.append(BookingSession.teacher_id == teacher_row.id)
    if student_row:
        session_filters.append(BookingSession.student_id == student_row.id)
    if session_filters:
        db.query(BookingSession).filter(
            and_(
                or_(*session_filters),
                BookingSession.status.in_(["pending", "confirmed"]),
            )
        ).update({BookingSession.status: "cancelled"}, synchronize_session=False)

    db.commit()
    return {
        "message": f"User {user.email} suspended.",
        "user_id": body.user_id,
        "reason": body.reason,
    }


@router.post("/unsuspend/{user_id}", summary="Lift a user suspension")
def unsuspend_user(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    from datetime import datetime, timezone
    suspensions = db.query(Suspension).filter(
        and_(Suspension.user_id == user_id, Suspension.is_active == True)
    ).all()
    for s in suspensions:
        s.is_active = False
        s.lifted_at = datetime.now(timezone.utc)
    user.is_suspended = False
    user.is_active = True
    db.commit()
    return {"message": f"User {user.email} suspension lifted."}


@router.delete("/users/{user_id}", summary="Admin: hard-delete a student or tutor account")
def admin_delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    """
    Removes a student or tutor account and the records that depend on it.

    Strategy:
      1. Soft-cancel every in-flight session involving the user so neither
         party can attempt to use the booking afterwards.
      2. Wipe the user's chat history, suspension history, exam attempts,
         materials they uploaded, certificates, and review rows.
      3. Drop the Student / Teacher profile row.
      4. Finally delete the User row itself.

    Admins themselves are protected — the endpoint refuses to delete an
    account whose role is "admin".
    """
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    email = _delete_user_account(target, db)
    db.commit()
    return {"message": f"Deleted user {email}.", "user_id": user_id}


@router.post("/sessions/auto-release", summary="Trigger manual auto-release")
def manual_auto_release(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    released = auto_release_overdue_payments(db)
    return {"message": "Auto-release completed.", "sessions_released": released}


@router.get("/sessions/overdue", summary="List overdue sessions awaiting payment release")
def list_overdue(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    from datetime import datetime, timezone, timedelta
    deadline = datetime.now(timezone.utc) - timedelta(hours=48)
    overdue = db.query(BookingSession).filter(
        and_(
            BookingSession.status           == "completed",
            BookingSession.payment_released == False,
            BookingSession.scheduled_at     <= deadline,
        )
    ).all()
    return {
        "total_overdue": len(overdue),
        "sessions": [
            {"session_id": str(s.id), "scheduled_at": str(s.scheduled_at),
             "teacher_id": str(s.teacher_id), "student_id": str(s.student_id)}
            for s in overdue
        ],
    }


@router.get("/dashboard", summary="Admin overview metrics")
def admin_dashboard(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    from sqlalchemy import func
    from datetime import datetime, timezone, timedelta
    from app.models.payment import Payment, PayPalTransaction
    from app.models.review import ReviewFlag

    # Count active User rows by role so this matches the Manage Tutors /
    # Manage Students lists (those also iterate `User.role`). Counting
    # Teacher / Student rows would miss accounts that registered as a tutor
    # but never finished the certification step, leading to a mismatched
    # total on the dashboard.
    total_teachers = (
        db.query(User)
        .filter(User.role == "teacher", User.is_suspended == False)  # noqa: E712
        .count()
    )
    total_students = (
        db.query(User)
        .filter(User.role == "student", User.is_suspended == False)  # noqa: E712
        .count()
    )
    total_sessions = db.query(BookingSession).count()
    completed_sessions = db.query(BookingSession).filter(
        BookingSession.status == "completed"
    ).count()
    pending_sessions = db.query(BookingSession).filter(
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
    deadline = datetime.now(timezone.utc) - timedelta(hours=48)
    overdue = db.query(BookingSession).filter(
        and_(
            BookingSession.status == "completed",
            BookingSession.payment_released == False,
            BookingSession.scheduled_at <= deadline,
        )
    ).count()

    return {
        "platform": "NativeTalk",
        "checked_at": str(datetime.now(timezone.utc)),
        "users": {
            "total_teachers": total_teachers,
            "total_students": total_students,
        },
        "sessions": {
            "total":     total_sessions,
            "completed": completed_sessions,
            "pending":   pending_sessions,
            "overdue_payments": overdue,
        },
        "financials": {
            "total_revenue":   round(float(total_revenue), 2),
            "platform_earned": round(float(platform_earned), 2),
            "teacher_payouts": round(float(teacher_payouts), 2),
            "currency": "EUR",
        },
        "alerts": {
            "pending_flags": pending_flags,
            "active_suspensions": active_suspensions,
            "overdue_payments": overdue,
        },
    }


@router.get("/tutors/pending", summary="List tutors awaiting verification")
def list_pending_tutors(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    """Returns tutor profiles where is_verified == False so admin can review."""
    pending = db.query(Teacher).filter(Teacher.is_verified == False).all()
    result = []
    for t in pending:
        u = db.query(User).filter(User.id == t.user_id).first()
        result.append({
            "teacher_id":     str(t.id),
            "user_id":        str(t.user_id),
            "full_name":      u.full_name if u else None,
            "email":          u.email if u else None,
            "profile_photo":  u.profile_photo if u else None,
            "bio":            t.bio or "",
            "is_certified":   bool(t.is_certified),
            "has_experience": bool(t.has_experience),
            "max_level":      t.max_level,
            "language_id":    t.language_id,
        })
    return result


@router.post("/tutors/{teacher_id}/approve", summary="Admin: approve a tutor")
def admin_approve_tutor(
    teacher_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Tutor not found.")
    teacher.is_verified = True
    db.commit()
    return {"message": "Tutor approved.", "teacher_id": teacher_id}


@router.post("/tutors/{teacher_id}/reject", summary="Admin: reject a tutor application")
def admin_reject_tutor(
    teacher_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Tutor not found.")
    teacher.is_verified = False
    user = db.query(User).filter(User.id == teacher.user_id).first()
    if user:
        user.is_active = False
    db.commit()
    return {"message": "Tutor application rejected.", "teacher_id": teacher_id}


@router.get("/transactions/{txn_id}", summary="Single transaction with full details")
def get_admin_transaction(
    txn_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    """
    Returns the full detail view of one transaction (PayPal payment or tutor
    payout) for the admin transaction-details screen, including the
    participants' emails and the tutor's running payout balance.
    """
    from sqlalchemy import func as sa_func
    from app.models.payment import CoursePayment, Payment, PayPalTransaction
    from app.models.student import Student as StudentModel

    txn = db.query(PayPalTransaction).filter(PayPalTransaction.id == txn_id).first()
    kind = "paypal_payment" if txn else None
    if not txn:
        txn = db.query(Payment).filter(Payment.id == txn_id).first()
        kind = "tutor_payout" if txn else None
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found.")

    cp = db.query(CoursePayment).filter(CoursePayment.id == txn.course_payment_id).first()
    teacher_user = None
    student_user = None
    teacher_balance = 0.0
    if cp:
        tch = db.query(Teacher).filter(Teacher.id == cp.teacher_id).first()
        if tch:
            teacher_user = db.query(User).filter(User.id == tch.user_id).first()
            teacher_balance = float(
                db.query(sa_func.coalesce(sa_func.sum(Payment.teacher_payout), 0))
                .join(CoursePayment, CoursePayment.id == Payment.course_payment_id)
                .filter(
                    CoursePayment.teacher_id == tch.id,
                    Payment.status == "released",
                )
                .scalar()
                or 0
            )
        stu = db.query(StudentModel).filter(StudentModel.id == cp.student_id).first()
        if stu:
            student_user = db.query(User).filter(User.id == stu.user_id).first()

    if kind == "paypal_payment":
        amount = float(txn.amount or 0)
        paid_at = txn.completed_at
    else:
        amount = float(txn.amount or 0)
        paid_at = txn.paid_at

    return {
        "id": str(txn.id),
        "kind": kind,
        "amount": amount,
        "currency": "EUR",
        "paid_at": str(paid_at) if paid_at else None,
        "created_at": str(txn.created_at) if txn.created_at else None,
        "level": cp.level if cp else None,
        "payment_plan": cp.payment_plan if cp else None,
        "student_name": student_user.full_name if student_user else None,
        "student_email": student_user.email if student_user else None,
        "teacher_name": teacher_user.full_name if teacher_user else None,
        "teacher_email": teacher_user.email if teacher_user else None,
        "teacher_balance": round(teacher_balance, 2),
    }


@router.get("/transactions", summary="List recent platform payments")
def list_admin_transactions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    """
    Returns both incoming PayPal payments AND tutor payouts in a single feed,
    sorted by date desc. Each row has a `kind` field ("paypal_payment" or
    "tutor_payout") so the admin UI can label them distinctly if it wants —
    today the screen renders them uniformly, which matches the wireframe.
    """
    from app.models.payment import Payment, CoursePayment, PayPalTransaction
    from app.models.student import Student as StudentModel

    out = []

    paypal_txns = (
        db.query(PayPalTransaction)
        .order_by(PayPalTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    for t in paypal_txns:
        cp = db.query(CoursePayment).filter(CoursePayment.id == t.course_payment_id).first()
        teacher_user = None
        student_user = None
        if cp:
            tch = db.query(Teacher).filter(Teacher.id == cp.teacher_id).first()
            if tch:
                teacher_user = db.query(User).filter(User.id == tch.user_id).first()
            stu = db.query(StudentModel).filter(StudentModel.id == cp.student_id).first()
            if stu:
                student_user = db.query(User).filter(User.id == stu.user_id).first()
        out.append({
            "id":              str(t.id),
            "kind":            "paypal_payment",
            "amount":          float(t.amount or 0),
            "status":          t.paypal_status,
            "paid_at":         str(t.completed_at) if t.completed_at else None,
            "created_at":      str(t.created_at) if t.created_at else None,
            "session_id":      None,
            "course_payment_id": str(t.course_payment_id),
            "level":           cp.level if cp else None,
            "payment_plan":    cp.payment_plan if cp else None,
            "teacher_name":    teacher_user.full_name if teacher_user else None,
            "student_name":    student_user.full_name if student_user else None,
            "paypal_order_id": t.paypal_order_id,
            "installment":     t.installment,
        })

    payouts = (
        db.query(Payment)
        .order_by(Payment.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    for p in payouts:
        cp = db.query(CoursePayment).filter(CoursePayment.id == p.course_payment_id).first()
        teacher_user = None
        student_user = None
        if cp:
            tch = db.query(Teacher).filter(Teacher.id == cp.teacher_id).first()
            if tch:
                teacher_user = db.query(User).filter(User.id == tch.user_id).first()
            stu = db.query(StudentModel).filter(StudentModel.id == cp.student_id).first()
            if stu:
                student_user = db.query(User).filter(User.id == stu.user_id).first()
        out.append({
            "id":             str(p.id),
            "kind":           "tutor_payout",
            "amount":         float(p.amount),
            "platform_fee":   float(p.platform_fee),
            "teacher_payout": float(p.teacher_payout),
            "status":         p.status,
            "paid_at":        str(p.paid_at) if p.paid_at else None,
            "created_at":     str(p.created_at) if p.created_at else None,
            "session_id":     str(p.session_id),
            "course_payment_id": str(p.course_payment_id),
            "level":          cp.level if cp else None,
            "payment_plan":   cp.payment_plan if cp else None,
            "teacher_name":   teacher_user.full_name if teacher_user else None,
            "student_name":   student_user.full_name if student_user else None,
        })

    # Sort the merged feed by created_at descending (None last).
    out.sort(key=lambda row: row.get("created_at") or "", reverse=True)
    return out[: limit]


@router.get("/users", summary="List users by role with basic stats")
def list_users(
    role: str = Query(default="student", description="Role to filter: 'student' or 'teacher'"),
    include_suspended: bool = Query(
        default=False,
        description="Set true to also include accounts already suspended.",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    """
    Returns active users with the given role, along with computed suspension
    eligibility stats. Suspended accounts are excluded by default so they
    disappear from Manage Students / Manage Tutors right after the admin
    removes them — pass include_suspended=true to view them anyway.

    For students: attendance rate and reschedule count.
    For teachers: number of logged no-shows.
    """
    query = db.query(User).filter(User.role == role)
    if not include_suspended:
        query = query.filter(User.is_suspended == False)  # noqa: E712
    users = query.offset(offset).limit(limit).all()
    result = []

    for user in users:
        base = {
            "id": str(user.id),
            "name": user.full_name or user.email,
            "email": user.email,
            "is_suspended": user.is_suspended,
            "created_at": str(user.created_at),
        }

        if role == "student":
            student = db.query(Student).filter(Student.user_id == user.id).first()
            if student:
                total = db.query(BookingSession).filter(
                    BookingSession.student_id == student.id
                ).count()
                completed = db.query(BookingSession).filter(
                    BookingSession.student_id == student.id,
                    BookingSession.status == "completed",
                ).count()
                cancelled = db.query(BookingSession).filter(
                    BookingSession.student_id == student.id,
                    BookingSession.status == "cancelled",
                ).count()
                attendance = round(completed / total * 100) if total > 0 else 100
                reschedules = student.reschedule_count or 0
                # Suspension rule: 5+ reschedules OR zero attendance with a cancellation.
                eligible = reschedules >= 5 or (attendance == 0 and cancelled > 0)
            else:
                attendance = 100
                reschedules = 0
                cancelled = 0
                eligible = False
            base.update({
                "attendance": f"{attendance}%",
                "reschedules": reschedules,
                "eligible": "Yes" if eligible else "No",
            })

        elif role == "teacher":
            teacher = db.query(Teacher).filter(Teacher.user_id == user.id).first()
            if teacher:
                absences = db.query(TeacherNoshow).filter(
                    TeacherNoshow.teacher_id == teacher.id
                ).count()
                eligible = absences >= 3
            else:
                absences = 0
                eligible = False
            base.update({
                "absences": absences,
                "eligible": "Yes" if eligible else "No",
            })

        result.append(base)

    return result
