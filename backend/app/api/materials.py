from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.material import LessonMaterial
from app.models.student import Student, StudentLanguage
from app.models.teacher import Teacher
from app.models.users import User
from app.utils.uploads import safe_upload_path, save_upload_file, upload_root
import uuid
import os

router = APIRouter()

UPLOAD_ROOT = upload_root("materials")
UPLOAD_DIR = UPLOAD_ROOT.as_posix()

VALID_TYPES = ["vocabulary_list", "grammar_guide", "practice_exercises", "audio_lesson"]
LEVELS      = ["A1", "A2", "B1", "B2", "C1", "C2"]
LESSON_NOTE_TYPE = "lesson_note"
MATERIAL_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "audio/mpeg",
    "audio/mp3",
}
MATERIAL_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".mp3", ".mpeg"}
MAX_MATERIAL_UPLOAD_BYTES = 50 * 1024 * 1024


def _material_to_dict(m: LessonMaterial) -> dict:
    return {
        "id":          str(m.id),
        "teacher_id":  str(m.teacher_id),
        "language_id": m.language_id,
        "title":       m.title,
        "type":        m.type,
        "level":       m.level,
        "description": m.description,
        "file_path":   m.file_path,
        "download_url": f"materials/{m.id}/download" if m.file_path else None,
        "created_at":  str(m.created_at) if m.created_at else None,
    }


@router.get("/", summary="List materials relevant to the current user")
def list_materials_for_me(
    level:       str | None = None,
    language_id: int | None = None,
    teacher_id:  str | None = None,
    db:          DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns materials for the caller.

    - Teacher → their own uploads.
    - Student → materials uploaded by any tutor they've booked a lesson with
      (joined via CoursePayment), unioned with any languages they're
      explicitly enrolled in. Falls back to "all materials" if the student
      has no relationships yet so the screen isn't empty during onboarding.
    """
    from app.models.payment import CoursePayment

    query = db.query(LessonMaterial).filter(LessonMaterial.type != LESSON_NOTE_TYPE)
    if teacher_id:
        query = query.filter(LessonMaterial.teacher_id == teacher_id)
    elif current_user.role == "teacher":
        teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
        if teacher:
            query = query.filter(LessonMaterial.teacher_id == teacher.id)
        else:
            return []
    elif current_user.role == "student":
        student = db.query(Student).filter(Student.user_id == current_user.id).first()
        if not student:
            return []

        # All tutors the student has paid for.
        cp_teacher_ids = [
            tid
            for (tid,) in db.query(CoursePayment.teacher_id)
            .filter(CoursePayment.student_id == student.id)
            .distinct()
        ]

        # All languages the student is enrolled in.
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
            query = query.filter(or_(*conds))
        # else: leave query unfiltered so the student sees a small sample of
        # materials available on the platform during onboarding.

    if level:
        query = query.filter(LessonMaterial.level == level)
    if language_id:
        query = query.filter(LessonMaterial.language_id == language_id)

    return [_material_to_dict(m) for m in query.order_by(LessonMaterial.created_at.desc()).all()]


@router.get("/{material_id}/download", summary="Download an uploaded material")
def download_material(
    material_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    material = db.query(LessonMaterial).filter(
        LessonMaterial.id == material_id,
        LessonMaterial.type != LESSON_NOTE_TYPE,
    ).first()
    if not material or not material.file_path:
        raise HTTPException(status_code=404, detail="Material file not found.")

    path = safe_upload_path(material.file_path, UPLOAD_ROOT)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Material file not found.")

    original_name = f"{material.title}{path.suffix}"
    return FileResponse(
        path,
        filename=original_name,
        media_type="application/octet-stream",
    )


@router.post("/", status_code=201, summary="Upload a new lesson material (current teacher only)")
async def upload_material_for_me(
    title:       str = Form(...),
    type:        str = Form(...),
    level:       str = Form(...),
    language_id: int = Form(...),
    description: str = Form(""),
    file:        UploadFile = File(...),
    db:          DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can upload materials.")
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found.")

    if type not in VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type! Choose from: {', '.join(VALID_TYPES)}",
        )
    if level not in LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level!")

    file_path = await save_upload_file(
        file,
        UPLOAD_ROOT,
        allowed_content_types=MATERIAL_CONTENT_TYPES,
        allowed_extensions=MATERIAL_EXTENSIONS,
        max_size_bytes=MAX_MATERIAL_UPLOAD_BYTES,
    )

    material = LessonMaterial(
        id          = uuid.uuid4(),
        teacher_id  = teacher.id,
        language_id = language_id,
        level       = level,
        title       = title,
        type        = type,
        file_path   = file_path,
        description = description,
    )
    db.add(material)
    db.commit()
    db.refresh(material)
    return _material_to_dict(material)


@router.post("/upload/{teacher_id}")
async def upload_material(
    teacher_id:  str,
    title:       str = Form(...),
    type:        str = Form(...),
    level:       str = Form(...),
    language_id: int = Form(...),
    description: str = Form(""),
    file:        UploadFile = File(...),
    db:          DBSession = Depends(get_db)
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")

    if type not in VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type! Choose from: {', '.join(VALID_TYPES)}"
        )

    if level not in LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level!")

    file_path = await save_upload_file(
        file,
        UPLOAD_ROOT,
        allowed_content_types=MATERIAL_CONTENT_TYPES,
        allowed_extensions=MATERIAL_EXTENSIONS,
        max_size_bytes=MAX_MATERIAL_UPLOAD_BYTES,
    )

    material = LessonMaterial(
        id=uuid.uuid4(),
        teacher_id=teacher_id,
        language_id=language_id,
        level=level,
        title=title,
        type=type,
        file_path=file_path,
        description=description
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    return {
        "message":     "Material uploaded successfully!",
        "material_id": str(material.id),
        "title":       title,
        "type":        type,
        "level":       level
    }


@router.get("/{teacher_id}")
def get_teacher_materials(
    teacher_id:  str,
    level:       str = None,
    language_id: int = None,
    db:          DBSession = Depends(get_db)
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")

    query = db.query(LessonMaterial).filter(
        LessonMaterial.teacher_id == teacher_id,
        LessonMaterial.type != LESSON_NOTE_TYPE,
    )
    if level:
        query = query.filter(LessonMaterial.level == level)
    if language_id:
        query = query.filter(LessonMaterial.language_id == language_id)

    materials = query.all()

    return {
        "teacher_id": teacher_id,
        "total":      len(materials),
        "materials": [
            {
                "id":          str(m.id),
                "title":       m.title,
                "type":        m.type,
                "level":       m.level,
                "description": m.description,
                "created_at":  str(m.created_at)
            }
            for m in materials
        ]
    }


@router.get("/student/{language_id}/{level}")
def get_materials_for_student(
    language_id: int,
    level:       str,
    db:          DBSession = Depends(get_db)
):
    if level not in LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level!")

    materials = db.query(LessonMaterial).filter(
        and_(
            LessonMaterial.language_id == language_id,
            LessonMaterial.level == level,
            LessonMaterial.type != LESSON_NOTE_TYPE,
        )
    ).all()

    grouped = {t: [] for t in VALID_TYPES}
    for m in materials:
        if m.type in grouped:
            grouped[m.type].append({
                "id":          str(m.id),
                "title":       m.title,
                "description": m.description,
                "created_at":  str(m.created_at)
            })

    return {
        "language_id": language_id,
        "level":       level,
        "total":       len(materials),
        "materials":   grouped
    }


@router.delete("/{material_id}")
def delete_material(
    material_id: str,
    db:          DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Tutor removes one of their own uploaded materials.

    Ownership is resolved from the JWT rather than a query string so a
    teacher cannot delete another teacher's material by guessing IDs.
    """
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only tutors can delete materials.")

    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found.")

    material = db.query(LessonMaterial).filter(
        and_(
            LessonMaterial.id == material_id,
            LessonMaterial.teacher_id == teacher.id,
        )
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found.")

    if material.file_path:
        path = safe_upload_path(material.file_path, UPLOAD_ROOT)
        try:
            os.remove(path)
        except OSError:
            # File might already be gone; don't block the DB cleanup over it.
            pass

    db.delete(material)
    db.commit()

    return {"message": "Material deleted successfully!", "material_id": material_id}
