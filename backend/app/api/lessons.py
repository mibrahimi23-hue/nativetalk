"""
Lessons router — student-friendly view over booked sessions.

A "lesson" in NativeTalk is one Session row enriched with the partner's
display info (teacher's name/photo for student-side; student name/photo
for teacher-side). All endpoints require auth and infer the caller's
role from the JWT.
"""
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.language import Language
from app.models.material import LessonMaterial
from app.models.payment import CoursePayment
from app.models.session import Session as BookingSession
from app.models.student import Student, StudentLanguage
from app.models.teacher import Teacher
from app.models.users import User

router = APIRouter()

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
LESSON_NOTE_TYPE = "lesson_note"


class LessonCreate(BaseModel):
    title: str
    description: str | None = ""
    level: str
    language_id: int | None = None
    material_ids: list[str] = []


class LessonUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    level: str | None = None


def _lesson_number(note: LessonMaterial, db: DBSession) -> int:
    rows = (
        db.query(LessonMaterial.id)
        .filter(
            LessonMaterial.teacher_id == note.teacher_id,
            LessonMaterial.language_id == note.language_id,
            LessonMaterial.level == note.level,
            LessonMaterial.type == LESSON_NOTE_TYPE,
        )
        .order_by(LessonMaterial.created_at.asc(), LessonMaterial.id.asc())
        .all()
    )
    ids = [str(row[0]) for row in rows]
    try:
        return ids.index(str(note.id)) + 1
    except ValueError:
        return 1


def _lesson_note_to_dict(note: LessonMaterial, db: DBSession) -> dict:
    language = db.query(Language).filter(Language.id == note.language_id).first()
    teacher = db.query(Teacher).filter(Teacher.id == note.teacher_id).first()
    teacher_user = db.query(User).filter(User.id == teacher.user_id).first() if teacher else None
    number = _lesson_number(note, db)
    return {
        "id": str(note.id),
        "lesson_id": str(note.id),
        "kind": "lesson_note",
        "lesson_number": number,
        "teacher_id": str(note.teacher_id),
        "student_id": None,
        "language_id": note.language_id,
        "language": language.name if language else None,
        "level": note.level,
        "title": note.title,
        "description": note.description or "",
        "tutor_name": teacher_user.full_name if teacher_user else None,
        "partner_name": teacher_user.full_name if teacher_user else None,
        "created_at": str(note.created_at) if note.created_at else None,
        "scheduled_at": str(note.created_at) if note.created_at else None,
        "status": "completed",
    }


def _accessible_lesson_notes(db: DBSession, current_user: User):
    query = db.query(LessonMaterial).filter(LessonMaterial.type == LESSON_NOTE_TYPE)

    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    student = db.query(Student).filter(Student.user_id == current_user.id).first()

    if teacher and not student:
        return query.filter(LessonMaterial.teacher_id == teacher.id)

    if student and not teacher:
        cp_teacher_ids = [
            tid
            for (tid,) in db.query(CoursePayment.teacher_id)
            .filter(CoursePayment.student_id == student.id)
            .distinct()
        ]
        enrolled_lang_ids = [
            sl.language_id
            for sl in db.query(StudentLanguage)
            .filter(StudentLanguage.student_id == student.id)
            .all()
        ]
        if cp_teacher_ids or enrolled_lang_ids:
            from sqlalchemy import or_

            conds = []
            if cp_teacher_ids:
                conds.append(LessonMaterial.teacher_id.in_(cp_teacher_ids))
            if enrolled_lang_ids:
                conds.append(LessonMaterial.language_id.in_(enrolled_lang_ids))
            return query.filter(or_(*conds))
        return query

    if teacher and student:
        return query.filter(LessonMaterial.teacher_id == teacher.id)

    return query.filter(False)


def _serialize(session: BookingSession, db: DBSession, viewer_role: str) -> dict:
    """Render a Session as a frontend-friendly 'lesson' payload."""
    language = db.query(Language).filter(Language.id == session.language_id).first()
    teacher = db.query(Teacher).filter(Teacher.id == session.teacher_id).first()
    student = db.query(Student).filter(Student.id == session.student_id).first()

    teacher_user = db.query(User).filter(User.id == teacher.user_id).first() if teacher else None
    student_user = db.query(User).filter(User.id == student.user_id).first() if student else None

    if viewer_role == "student":
        partner_user = teacher_user
        partner_id = str(teacher.id) if teacher else None
    else:
        partner_user = student_user
        partner_id = str(student.id) if student else None

    note = (
        db.query(LessonMaterial)
        .filter(
            LessonMaterial.teacher_id == session.teacher_id,
            LessonMaterial.language_id == session.language_id,
            LessonMaterial.level == session.level,
            LessonMaterial.type == LESSON_NOTE_TYPE,
        )
        .order_by(LessonMaterial.created_at.asc())
        .first()
    )

    return {
        "id":                  str(session.id),
        "session_id":          str(session.id),
        "kind":                "session",
        "course_payment_id":   str(session.course_payment_id),
        "teacher_id":          str(session.teacher_id),
        "student_id":          str(session.student_id),
        "language_id":         session.language_id,
        "language":            language.name if language else None,
        "level":               session.level,
        "scheduled_at":        str(session.scheduled_at) if session.scheduled_at else None,
        "duration_minutes":    session.duration_minutes,
        "status":              session.status,
        "videocall_url":       session.videocall_url,
        "daily_room_url":      session.daily_room_url,
        "teacher_review_done": bool(session.teacher_review_done),
        "student_review_done": bool(session.student_review_done),
        "payment_released":    bool(session.payment_released),
        "partner_id":          partner_id,
        "partner_name":        partner_user.full_name if partner_user else None,
        "partner_photo":       partner_user.profile_photo if partner_user else None,
        "tutor_name":          teacher_user.full_name if teacher_user else None,
        "lesson_number":       _lesson_number(note, db) if note else 1,
        "title":               note.title if note else f"{language.name if language else 'Language'} {session.level} lesson",
        "description":         note.description if note else "",
    }


@router.post("/", status_code=201, summary="Create a tutor-written lesson")
def create_lesson(
    body: LessonCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=403, detail="Only tutors can create lessons.")

    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Lesson title is required.")
    if body.level not in LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid level. Must be one of {LEVELS}")

    language_id = body.language_id or teacher.language_id
    language = db.query(Language).filter(Language.id == language_id).first()
    if not language:
        raise HTTPException(status_code=404, detail="Language not found.")

    note = LessonMaterial(
        id=uuid.uuid4(),
        teacher_id=teacher.id,
        language_id=language_id,
        level=body.level,
        title=title,
        type=LESSON_NOTE_TYPE,
        file_path=None,
        description=(body.description or "").strip(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _lesson_note_to_dict(note, db)


@router.get("/mine", summary="List my lessons (uses auth)")
def list_my_lessons(
    status: str | None = None,
    level:  str | None = None,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[dict]:
    note_query = _accessible_lesson_notes(db, current_user)
    if level:
        if level not in LEVELS:
            raise HTTPException(status_code=400, detail=f"Invalid level. Must be one of {LEVELS}")
        note_query = note_query.filter(LessonMaterial.level == level)
    notes = note_query.order_by(LessonMaterial.created_at.desc()).all()

    if not status or status == "completed":
        note_rows = [_lesson_note_to_dict(note, db) for note in notes]
    else:
        note_rows = []

    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    student = db.query(Student).filter(Student.user_id == current_user.id).first()

    query = db.query(BookingSession)
    if teacher and not student:
        query = query.filter(BookingSession.teacher_id == teacher.id)
        viewer_role = "teacher"
    elif student and not teacher:
        query = query.filter(BookingSession.student_id == student.id)
        viewer_role = "student"
    elif teacher and student:
        query = query.filter(
            (BookingSession.teacher_id == teacher.id)
            | (BookingSession.student_id == student.id)
        )
        viewer_role = "student"
    else:
        return note_rows

    if status:
        query = query.filter(BookingSession.status == status)
    if level:
        if level not in LEVELS:
            raise HTTPException(status_code=400, detail=f"Invalid level. Must be one of {LEVELS}")
        query = query.filter(BookingSession.level == level)

    sessions = query.order_by(BookingSession.scheduled_at.desc()).all()
    session_rows = [_serialize(s, db, viewer_role) for s in sessions]
    return note_rows + session_rows


@router.put("/{lesson_id}", summary="Update a tutor-written lesson")
def update_lesson(
    lesson_id: str,
    body: LessonUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Tutors edit lessons they previously created. Only `title`, `description`
    and `level` are mutable — language and ownership stay locked. Booked
    sessions (which are also surfaced as "lessons" by the API) are not
    editable through this endpoint; the row must be a lesson_note.
    """
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=403, detail="Only tutors can edit lessons.")

    note = db.query(LessonMaterial).filter(
        LessonMaterial.id == lesson_id,
        LessonMaterial.type == LESSON_NOTE_TYPE,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Lesson not found.")
    if str(note.teacher_id) != str(teacher.id):
        raise HTTPException(status_code=403, detail="You can only edit your own lessons.")

    if body.title is not None:
        new_title = body.title.strip()
        if not new_title:
            raise HTTPException(status_code=400, detail="Lesson title is required.")
        note.title = new_title

    if body.description is not None:
        note.description = body.description.strip()

    if body.level is not None:
        if body.level not in LEVELS:
            raise HTTPException(status_code=400, detail=f"Invalid level. Must be one of {LEVELS}")
        note.level = body.level

    db.commit()
    db.refresh(note)
    return _lesson_note_to_dict(note, db)


@router.delete("/{lesson_id}", summary="Delete a tutor-written lesson")
def delete_lesson(
    lesson_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Owning tutor removes a lesson_note row they previously created."""
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=403, detail="Only tutors can delete lessons.")

    note = db.query(LessonMaterial).filter(
        LessonMaterial.id == lesson_id,
        LessonMaterial.type == LESSON_NOTE_TYPE,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Lesson not found.")
    if str(note.teacher_id) != str(teacher.id):
        raise HTTPException(status_code=403, detail="You can only delete your own lessons.")

    db.delete(note)
    db.commit()
    return {"message": "Lesson deleted.", "lesson_id": lesson_id}


@router.get("/{lesson_id}", summary="Get a single lesson")
def get_lesson(
    lesson_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    note = db.query(LessonMaterial).filter(
        LessonMaterial.id == lesson_id,
        LessonMaterial.type == LESSON_NOTE_TYPE,
    ).first()
    if note:
        allowed = _accessible_lesson_notes(db, current_user).filter(
            LessonMaterial.id == note.id
        ).first()
        if not allowed:
            raise HTTPException(status_code=403, detail="Not allowed to view this lesson.")
        return _lesson_note_to_dict(note, db)

    session = db.query(BookingSession).filter(BookingSession.id == lesson_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Lesson not found.")

    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    student = db.query(Student).filter(Student.user_id == current_user.id).first()

    is_teacher = teacher and str(teacher.id) == str(session.teacher_id)
    is_student = student and str(student.id) == str(session.student_id)
    if not (is_teacher or is_student):
        raise HTTPException(status_code=403, detail="Not a participant in this lesson.")

    viewer_role = "teacher" if is_teacher else "student"
    return _serialize(session, db, viewer_role)
