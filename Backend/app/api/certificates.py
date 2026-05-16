from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session as DBSession
from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.certificate import TeacherCertificate
from app.models.teacher import Teacher
from app.models.users import User
from app.utils.uploads import safe_upload_path, save_upload_file, upload_root
import uuid
import os

router = APIRouter()

UPLOAD_ROOT = upload_root("certificates")
UPLOAD_DIR = UPLOAD_ROOT.as_posix()
CERTIFICATE_CONTENT_TYPES = {"application/pdf", "image/jpeg", "image/png"}
CERTIFICATE_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
MAX_CERTIFICATE_UPLOAD_BYTES = 10 * 1024 * 1024


def _cert_to_dict(c: TeacherCertificate) -> dict:
    return {
        "id":           str(c.id),
        "teacher_id":   str(c.teacher_id),
        "name":         c.name,
        "file_path":    c.file_path,
        "is_notarized": c.is_notarized,
        "is_verified":  c.is_verified,
        "uploaded_at":  str(c.uploaded_at) if c.uploaded_at else None,
    }


@router.get("/me", summary="List my certificates (teacher only)")
def get_my_certificates(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers have certificates.")
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        return []
    certs = db.query(TeacherCertificate).filter(
        TeacherCertificate.teacher_id == teacher.id
    ).all()
    return [_cert_to_dict(c) for c in certs]


@router.post("/upload", status_code=201, summary="Upload a certificate (current teacher only)")
async def upload_certificate_for_me(
    name:        str = Form(...),
    is_notarized: str = Form("false"),
    file:        UploadFile = File(...),
    db:          DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can upload certificates.")
    teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher profile not found.")

    cert_path = await save_upload_file(
        file,
        UPLOAD_ROOT,
        allowed_content_types=CERTIFICATE_CONTENT_TYPES,
        allowed_extensions=CERTIFICATE_EXTENSIONS,
        max_size_bytes=MAX_CERTIFICATE_UPLOAD_BYTES,
    )

    notarized_flag = str(is_notarized).lower() in ("1", "true", "yes")

    cert = TeacherCertificate(
        id=uuid.uuid4(),
        teacher_id=teacher.id,
        name=name,
        file_path=cert_path,
        is_notarized=notarized_flag,
        is_verified=False,
    )
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return _cert_to_dict(cert)


@router.post("/upload/{teacher_id}")
async def upload_certificate(
    teacher_id:  str,
    name:        str = Form(...),
    certificate: UploadFile = File(...),
    notarized:   UploadFile = File(None),
    db:          DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")
    if current_user.role != "admin" and teacher.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only upload your own certificates.")

    cert_path = await save_upload_file(
        certificate,
        UPLOAD_ROOT,
        allowed_content_types=CERTIFICATE_CONTENT_TYPES,
        allowed_extensions=CERTIFICATE_EXTENSIONS,
        max_size_bytes=MAX_CERTIFICATE_UPLOAD_BYTES,
    )

    notarized_path = None
    if notarized and notarized.filename:
        notarized_path = await save_upload_file(
            notarized,
            UPLOAD_ROOT,
            allowed_content_types=CERTIFICATE_CONTENT_TYPES,
            allowed_extensions=CERTIFICATE_EXTENSIONS,
            max_size_bytes=MAX_CERTIFICATE_UPLOAD_BYTES,
        )

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
        "certificates": [_cert_to_dict(c) for c in certs]
    }


@router.put("/{certificate_id}/verify")
def verify_certificate(
    certificate_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
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
    teacher_id:     str | None = None,
    db:             DBSession = Depends(get_db),
    current_user:   User = Depends(get_current_user),
):
    query = db.query(TeacherCertificate).filter(TeacherCertificate.id == certificate_id)
    if teacher_id:
        query = query.filter(TeacherCertificate.teacher_id == teacher_id)
    if current_user.role != "admin":
        teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
        if not teacher:
            raise HTTPException(status_code=403, detail="Only teachers can delete certificates.")
        query = query.filter(TeacherCertificate.teacher_id == teacher.id)

    cert = query.first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found!")

    if cert.file_path:
        path = safe_upload_path(cert.file_path, UPLOAD_ROOT)
        if path.exists():
            os.remove(path)

    db.delete(cert)
    db.commit()

    return {"message": "Certificate deleted successfully!"}
