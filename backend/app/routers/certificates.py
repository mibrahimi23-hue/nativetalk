from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session as DBSession
from app.db.session import get_db
from app.models.certificate import TeacherCertificate
from app.models.teacher import Teacher
import uuid
import os

router = APIRouter()

UPLOAD_DIR = "uploads/certificates"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload/{teacher_id}")
async def upload_certificate(
    teacher_id:  str,
    name:        str = Form(...),
    certificate: UploadFile = File(...),
    notarized:   UploadFile = File(None),
    db:          DBSession = Depends(get_db)
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")

    allowed_types = ["application/pdf", "image/jpeg", "image/png"]
    if certificate.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, JPG or PNG files are allowed!"
        )

    cert_filename = f"{uuid.uuid4()}_{certificate.filename}"
    cert_path     = f"{UPLOAD_DIR}/{cert_filename}"
    with open(cert_path, "wb") as f:
        f.write(await certificate.read())

    notarized_path = None
    if notarized and notarized.filename:
        if notarized.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail="Only PDF, JPG or PNG files are allowed for notarized certificate!"
            )
        not_filename   = f"{uuid.uuid4()}_{notarized.filename}"
        notarized_path = f"{UPLOAD_DIR}/{not_filename}"
        with open(notarized_path, "wb") as f:
            f.write(await notarized.read())

    cert = TeacherCertificate(
        id=uuid.uuid4(),
        teacher_id=teacher_id,
        name=name,
        file_path=cert_path,
        is_notarized=notarized_path is not None,
        is_verified=False
    )
    db.add(cert)
    db.commit()
    db.refresh(cert)

    return {
        "message":        "Certificate uploaded successfully!",
        "certificate_id": str(cert.id),
        "name":           name,
        "is_notarized":   cert.is_notarized,
        "status":         "pending review"
    }


@router.get("/{teacher_id}")
def get_teacher_certificates(
    teacher_id: str,
    db: DBSession = Depends(get_db)
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")

    certs = db.query(TeacherCertificate).filter(
        TeacherCertificate.teacher_id == teacher_id
    ).all()

    return {
        "teacher_id": teacher_id,
        "total":      len(certs),
        "certificates": [
            {
                "id":           str(c.id),
                "name":         c.name,
                "is_notarized": c.is_notarized,
                "is_verified":  c.is_verified,
                "uploaded_at":  str(c.uploaded_at)
            }
            for c in certs
        ]
    }


@router.put("/{certificate_id}/verify")
def verify_certificate(
    certificate_id: str,
    db: DBSession = Depends(get_db)
):
    cert = db.query(TeacherCertificate).filter(
        TeacherCertificate.id == certificate_id
    ).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found!")

    cert.is_verified = True
    db.commit()

    return {
        "message":        "Certificate verified!",
        "certificate_id": certificate_id,
        "is_verified":    True
    }


@router.delete("/{certificate_id}")
def delete_certificate(
    certificate_id: str,
    teacher_id:     str,
    db:             DBSession = Depends(get_db)
):
    cert = db.query(TeacherCertificate).filter(
        TeacherCertificate.id == certificate_id,
        TeacherCertificate.teacher_id == teacher_id
    ).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found!")

    if os.path.exists(cert.file_path):
        os.remove(cert.file_path)

    db.delete(cert)
    db.commit()

    return {"message": "Certificate deleted successfully!"}