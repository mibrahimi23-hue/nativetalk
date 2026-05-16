from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.exam import Exam, ExamQuestion, ExamAttempt, ExamAnswer
from app.models.teacher import Teacher
from app.models.language import Language
from app.models.users import User
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import List
import uuid

router = APIRouter()

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
PASS_SCORE = 0.70


class QuestionCreate(BaseModel):
    question_text:  str
    option_a:       str
    option_b:       str
    option_c:       str
    option_d:       str
    correct_answer: str


class ExamCreate(BaseModel):
    language_id: int
    level:       str
    title:       str
    questions:   List[QuestionCreate]


class AnswerSubmit(BaseModel):
    question_id: str
    answer:      str


class ExamSubmit(BaseModel):
    answers: List[AnswerSubmit]


# ── Create Exam ───────────────────────────────────────────────────────────────

@router.post("/create")
def create_exam(
    data: ExamCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ✅ Get teacher from auth token — no need to pass teacher_id manually
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found!")

    if not teacher.has_experience:
        raise HTTPException(
            status_code=403,
            detail="Only experienced teachers can create exams!"
        )

    if data.level not in LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level!")

    if LEVELS.index(data.level) > LEVELS.index(teacher.max_level):
        raise HTTPException(
            status_code=403,
            detail=f"You can only create exams up to your level ({teacher.max_level})!"
        )

    language = db.query(Language).filter(Language.id == data.language_id).first()
    if not language:
        raise HTTPException(status_code=404, detail="Language not found!")

    if len(data.questions) < 1:
        raise HTTPException(
            status_code=400,
            detail="Exam must have at least 1 question!"
        )

    for q in data.questions:
        if q.correct_answer.upper() not in ["A", "B", "C", "D"]:
            raise HTTPException(
                status_code=400,
                detail="Correct answer must be A, B, C or D!"
            )

    exam = Exam(
        id=uuid.uuid4(),
        language_id=data.language_id,
        level=data.level,
        title=data.title,
        created_by=teacher.id,
        is_active=True
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)

    for q in data.questions:
        question = ExamQuestion(
            id=uuid.uuid4(),
            exam_id=exam.id,
            question_text=q.question_text,
            option_a=q.option_a,
            option_b=q.option_b,
            option_c=q.option_c,
            option_d=q.option_d,
            correct_answer=q.correct_answer.upper()
        )
        db.add(question)

    db.commit()

    return {
        "message":         "Exam created successfully!",
        "exam_id":         str(exam.id),
        "language":        language.name,
        "level":           data.level,
        "title":           data.title,
        "total_questions": len(data.questions)
    }


# ── Get Exam ──────────────────────────────────────────────────────────────────

@router.get("/list/{language_id}/{level}")
def list_exams(
    language_id: int,
    level:       str,
    db:          DBSession = Depends(get_db)
):
    if level not in LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level!")

    exams = db.query(Exam).filter(
        and_(
            Exam.language_id == language_id,
            Exam.level == level,
            Exam.is_active == True
        )
    ).all()

    return {
        "language_id": language_id,
        "level":       level,
        "total":       len(exams),
        "exams": [
            {
                "exam_id":         str(e.id),
                "title":           e.title,
                "total_questions": len(e.questions),
                "created_at":      str(e.created_at)
            }
            for e in exams
        ]
    }


@router.get("/by-language/{language_id}")
def list_exams_for_language(
    language_id: int,
    db:          DBSession = Depends(get_db),
):
    """
    All published exams for a language, all levels combined.

    Used by the tutor onboarding flow: when a tutor without a certificate
    reaches the language-examination screen, the app calls this endpoint
    with the language the tutor signed up to teach. The first exam returned
    (sorted by ascending level — A1 first) is the one the tutor takes.
    """
    language = db.query(Language).filter(Language.id == language_id).first()
    if not language:
        raise HTTPException(status_code=404, detail="Language not found!")

    exams = db.query(Exam).filter(
        and_(Exam.language_id == language_id, Exam.is_active == True)
    ).all()
    # Sort by CEFR rank so the simplest exam is first.
    exams.sort(key=lambda e: LEVELS.index(e.level) if e.level in LEVELS else 99)

    return {
        "language_id": language_id,
        "language":    language.name,
        "total":       len(exams),
        "exams": [
            {
                "exam_id":         str(e.id),
                "title":           e.title,
                "level":           e.level,
                "total_questions": len(e.questions),
                "created_at":      str(e.created_at) if e.created_at else None,
            }
            for e in exams
        ],
    }


@router.get("/attempts/{teacher_id}")
def get_teacher_attempts(
    teacher_id: str,
    db: DBSession = Depends(get_db)
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")

    attempts = db.query(ExamAttempt).filter(
        ExamAttempt.teacher_id == teacher_id
    ).all()

    return {
        "teacher_id":     teacher_id,
        "total_attempts": len(attempts),
        "attempts": [
            {
                "attempt_id":   str(a.id),
                "exam_id":      str(a.exam_id),
                "score":        a.score,
                "total":        a.total,
                "percentage":   f"{round((a.score / a.total) * 100, 1)}%" if a.total > 0 else "0%",
                "passed":       a.passed,
                "completed_at": str(a.completed_at)
            }
            for a in attempts
        ]
    }


@router.get("/{exam_id}")
def get_exam(
    exam_id: str,
    db: DBSession = Depends(get_db)
):
    exam = db.query(Exam).filter(
        and_(Exam.id == exam_id, Exam.is_active == True)
    ).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found!")

    language = db.query(Language).filter(Language.id == exam.language_id).first()

    return {
        "exam_id":   str(exam.id),
        "title":     exam.title,
        "language":  language.name,
        "level":     exam.level,
        "total_questions": len(exam.questions),
        "pass_score": f"{int(PASS_SCORE * 100)}%",
        "questions": [
            {
                "question_id":   str(q.id),
                "question_text": q.question_text,
                "options": {
                    "A": q.option_a,
                    "B": q.option_b,
                    "C": q.option_c,
                    "D": q.option_d
                }
            }
            for q in exam.questions
        ]
    }


# ── Submit Exam ───────────────────────────────────────────────────────────────

@router.post("/{exam_id}/submit")
def submit_exam(
    exam_id: str,
    data:    ExamSubmit,
    db:      DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found!")

    exam = db.query(Exam).filter(
        and_(Exam.id == exam_id, Exam.is_active == True)
    ).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found!")

    existing = db.query(ExamAttempt).filter(
        and_(
            ExamAttempt.exam_id    == exam_id,
            ExamAttempt.teacher_id == str(teacher.id),
            ExamAttempt.passed     == True
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You have already passed this exam!")

    question_ids = {str(q.id): q for q in exam.questions}
    for ans in data.answers:
        if ans.question_id not in question_ids:
            raise HTTPException(status_code=400, detail=f"Question {ans.question_id} does not belong to this exam!")
        if ans.answer.upper() not in ["A", "B", "C", "D"]:
            raise HTTPException(status_code=400, detail="Answer must be A, B, C or D!")

    attempt = ExamAttempt(
        id=uuid.uuid4(),
        exam_id=exam_id,
        teacher_id=str(teacher.id),
        score=0,
        total=len(exam.questions),
        passed=False,
        completed_at=datetime.now(timezone.utc)
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    score = 0
    for ans in data.answers:
        question   = question_ids[ans.question_id]
        is_correct = ans.answer.upper() == question.correct_answer
        if is_correct:
            score += 1
        db.add(ExamAnswer(
            id=uuid.uuid4(),
            attempt_id=attempt.id,
            question_id=ans.question_id,
            answer=ans.answer.upper(),
            is_correct=is_correct
        ))

    passed = (score / len(exam.questions)) >= PASS_SCORE
    attempt.score  = score
    attempt.passed = passed

    # Cap derived from the tutor's certificate flags:
    #   no certificate            → A2  (exam pass alone never lifts above A2)
    #   language certificate      → B2
    #   certificate + experience  → C2
    # The exam can only bump max_level up to this cert-derived cap. A tutor
    # without a certificate who passes a B1/B2/C1/C2 exam still teaches
    # "up to A2" — the platform requires a real certificate for B1+.
    if teacher.is_certified and teacher.has_experience:
        cert_cap_idx = LEVELS.index("C2")
    elif teacher.is_certified:
        cert_cap_idx = LEVELS.index("B2")
    else:
        cert_cap_idx = LEVELS.index("A2")

    if passed:
        target_idx = min(LEVELS.index(exam.level), cert_cap_idx)
        if target_idx > LEVELS.index(teacher.max_level):
            teacher.max_level = LEVELS[target_idx]
        teacher.passed_exam = True

    db.commit()

    # Surface the level the tutor can ACTUALLY teach right now (the cap
    # they end up at) so the result screen never lies about granting B1+
    # without a certificate.
    current_level = teacher.max_level
    cert_cap_level = LEVELS[cert_cap_idx]
    needs_cert_for_exam_level = (
        passed and LEVELS.index(exam.level) > cert_cap_idx
    )

    if passed and needs_cert_for_exam_level:
        result_message = (
            f"You passed the {exam.level} exam, but teaching {exam.level} "
            f"requires a language certificate. You can still teach up to "
            f"{current_level}. Upload a certificate to unlock {exam.level}."
        )
    elif passed:
        result_message = (
            f"Congratulations! You passed and can now teach up to "
            f"{current_level}."
        )
    else:
        # Failure = no teaching privileges at all until they retake and pass.
        # We don't surface A1/A2 here — the result screen has to make it
        # clear that nothing is unlocked yet.
        result_message = (
            f"You did not pass — you need {int(PASS_SCORE * 100)}%. "
            f"You can't teach yet. Try the exam again to unlock teaching."
        )

    return {
        "message":        "Exam submitted successfully!",
        "attempt_id":     str(attempt.id),
        "score":          score,
        "total":          len(exam.questions),
        "percentage":     f"{round((score / len(exam.questions)) * 100, 1)}%",
        "passed":         passed,
        "pass_required":  f"{int(PASS_SCORE * 100)}%",
        # On fail we return None so the result screen renders the
        # "Locked — retake to unlock teaching" state instead of pretending
        # the tutor still has an A2 baseline.
        "new_max_level":  current_level if passed else None,
        "cert_cap":       cert_cap_level,
        "message_result": result_message,
    }


# ── Deactivate Exam ───────────────────────────────────────────────────────────

@router.delete("/{exam_id}")
def deactivate_exam(
    exam_id: str,
    db:      DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found!")

    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found!")

    if str(exam.created_by) != str(teacher.id):
        raise HTTPException(status_code=403, detail="You can only deactivate your own exams!")

    exam.is_active = False
    db.commit()

    return {"message": "Exam deactivated successfully!", "exam_id": exam_id}