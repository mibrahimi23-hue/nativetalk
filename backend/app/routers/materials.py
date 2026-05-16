from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from database import get_db
from models.material import LessonMaterial
from models.teacher import Teacher
import uuid
import os

router = APIRouter()

UPLOAD_DIR = "uploads/materials"
os.makedirs(UPLOAD_DIR, exist_ok=True)

VALID_TYPES = ["vocabulary_list", "grammar_guide", "practice_exercises", "audio_lesson"]
LEVELS      = ["A1", "A2", "B1", "B2", "C1", "C2"]


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

    allowed_types = ["application/pdf", "image/jpeg", "image/png", "audio/mpeg", "audio/mp3"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, JPG, PNG or MP3 files are allowed!"
        )

    filename  = f"{uuid.uuid4()}_{file.filename}"
    file_path = f"{UPLOAD_DIR}/{filename}"
    with open(file_path, "wb") as f:
        f.write(await file.read())

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
        LessonMaterial.teacher_id == teacher_id
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
            LessonMaterial.level == level
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
    teacher_id:  str,
    db:          DBSession = Depends(get_db)
):
    material = db.query(LessonMaterial).filter(
        and_(
            LessonMaterial.id == material_id,
            LessonMaterial.teacher_id == teacher_id
        )
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found!")

    if material.file_path and os.path.exists(material.file_path):
        os.remove(material.file_path)

    db.delete(material)
    db.commit()

    return {"message": "Material deleted successfully!"}