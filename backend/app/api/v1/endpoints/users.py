"""
User management endpoints.

All endpoints require authentication.
Role-restricted operations (admin) use require_role("admin").
"""
import io
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image as PilImage
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.users import User
from app.schemas.user import UserOut, UserUpdate
from app.utils.uploads import safe_upload_path, upload_root
from app.services.timezone import (
    is_valid_timezone,
    resolve_student_timezone,
    timezone_for_language,
    timezone_for_location,
)

router = APIRouter(prefix="/users", tags=["Users"])

AVATAR_ROOT = upload_root("avatars")
AVATAR_DIR = AVATAR_ROOT.as_posix()
MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024
PilImage.MAX_IMAGE_PIXELS = 10_000_000


@router.get("/me", response_model=UserOut, summary="Get own profile")
def get_me(current_user: User = Depends(get_current_user)):
    """Returns full profile of the authenticated user."""
    return current_user


@router.patch("/me", response_model=UserOut, summary="Update own profile")
def update_me(
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    React Native sends only the fields to update:
        { "full_name": "Maria", "timezone": "Europe/Madrid" }

    For students the `language_id` + `level` fields update the Student and
    StudentLanguage rows. For tutors they update Teacher.language_id and
    Teacher.max_level. `bio` writes through to Teacher.bio for tutors.
    """
    from app.models.student import Student, StudentLanguage
    from app.models.language import Language, LevelPricing
    from app.models.teacher import Teacher

    update_data = body.model_dump(exclude_unset=True)
    role_specific = {
        k: update_data.pop(k)
        for k in ("language_id", "level", "bio", "hourly_rate")
        if k in update_data
    }
    explicit_timezone = update_data.pop("timezone", None)
    for field, value in update_data.items():
        setattr(current_user, field, value)

    if role_specific:
        if current_user.role == "student":
            student = db.query(Student).filter(Student.user_id == current_user.id).first()
            if student:
                if "level" in role_specific and role_specific["level"]:
                    student.current_level = role_specific["level"]
                if "language_id" in role_specific and role_specific["language_id"]:
                    existing = (
                        db.query(StudentLanguage)
                        .filter(StudentLanguage.student_id == student.id)
                        .order_by(StudentLanguage.started_at.asc())
                        .first()
                    )
                    if existing:
                        existing.language_id = role_specific["language_id"]
                        if role_specific.get("level"):
                            existing.level = role_specific["level"]
                    else:
                        db.add(StudentLanguage(
                            student_id=student.id,
                            language_id=role_specific["language_id"],
                            level=role_specific.get("level") or "A1",
                        ))
        elif current_user.role == "teacher":
            teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
            if teacher:
                if "language_id" in role_specific and role_specific["language_id"]:
                    teacher.language_id = role_specific["language_id"]
                if "level" in role_specific and role_specific["level"]:
                    # A tutor can only raise their teaching level if they have
                    # uploaded the matching certificates (or already passed an
                    # exam for that level). Cap derived from the cert flags:
                    #     no cert            → A2
                    #     language cert      → B2
                    #     cert + experience  → C2
                    # Exam-verified teachers may already be above the baseline
                    # cap — we let them keep that level.
                    LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
                    requested = str(role_specific["level"]).upper()
                    if requested not in LEVELS:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Unknown level '{requested}'.",
                        )
                    if teacher.is_certified and teacher.has_experience:
                        cap = "C2"
                    elif teacher.is_certified:
                        cap = "B2"
                    else:
                        cap = "A2"
                    # Allow lowering at any time, and allow keeping the level
                    # the exam already proved.
                    current_idx = LEVELS.index(teacher.max_level or "A2")
                    new_idx = LEVELS.index(requested)
                    cap_idx = LEVELS.index(cap)
                    if new_idx > cap_idx and not teacher.is_verified and new_idx > current_idx:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"You cannot change your level to {requested}. "
                                f"Upload a language certificate (and an "
                                f"experience certificate for B2+) for this "
                                f"language first. Your current cap is {cap}."
                            ),
                        )
                    teacher.max_level = requested
                if "bio" in role_specific and role_specific["bio"] is not None:
                    teacher.bio = role_specific["bio"]
                if "hourly_rate" in role_specific and role_specific["hourly_rate"] is not None:
                    # The tutor's hourly rate must fall inside the platform's
                    # pricing range for the level they teach (LevelPricing keeps
                    # min/max per CEFR level, e.g. A1: €3-€5, A2: €4-€6, ...).
                    new_rate = float(role_specific["hourly_rate"])
                    pricing = (
                        db.query(LevelPricing)
                        .filter(LevelPricing.level == teacher.max_level)
                        .first()
                    )
                    if pricing and not (
                        float(pricing.price_min) <= new_rate <= float(pricing.price_max)
                    ):
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"You cannot apply that price. For level "
                                f"{teacher.max_level} the price is between "
                                f"€{float(pricing.price_min):.2f} and "
                                f"€{float(pricing.price_max):.2f}/hr."
                            ),
                        )
                    teacher.hourly_rate = new_rate

    if current_user.role == "student":
        current_user.timezone = resolve_student_timezone(
            current_user.location,
            explicit_timezone if explicit_timezone is not None else current_user.timezone,
        )
    elif current_user.role == "teacher":
        # The tutor's timezone follows where they actually live, NOT the
        # language they teach. A Spanish person teaching Italian is still in
        # Europe/Madrid, not Europe/Rome. Resolution order:
        #   1. Location they typed (e.g. "Madrid", "Tokyo")
        #   2. Explicit timezone the frontend sent
        #   3. Fallback: the language they teach (better than UTC)
        location_tz = timezone_for_location(current_user.location)
        if location_tz:
            current_user.timezone = location_tz
        elif explicit_timezone and is_valid_timezone(explicit_timezone):
            current_user.timezone = explicit_timezone
        else:
            teacher = db.query(Teacher).filter(Teacher.user_id == current_user.id).first()
            language = (
                db.query(Language).filter(Language.id == teacher.language_id).first()
                if teacher
                else None
            )
            teaching_tz = (
                timezone_for_language(language.code) or timezone_for_language(language.name)
                if language
                else None
            )
            if teaching_tz:
                current_user.timezone = teaching_tz
    elif explicit_timezone and is_valid_timezone(explicit_timezone):
        current_user.timezone = explicit_timezone

    db.commit()
    db.refresh(current_user)
    return current_user


@router.get(
    "/me/pricing-ranges",
    summary="Allowed price / hours ranges for every CEFR level",
)
def get_pricing_ranges(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the platform's min/max hourly price and total hours for each
    CEFR level (A1..C2). The tutor profile UI uses this so the rate field
    can show the valid range for whichever max_level the tutor teaches —
    e.g. A1: €3-€5/hr, C2: €7-€9/hr.
    """
    from app.models.language import LevelHours, LevelPricing

    pricing = {p.level: p for p in db.query(LevelPricing).all()}
    hours = {h.level: h for h in db.query(LevelHours).all()}
    levels = ["A1", "A2", "B1", "B2", "C1", "C2"]
    out = []
    for level in levels:
        p = pricing.get(level)
        h = hours.get(level)
        out.append({
            "level":      level,
            "price_min":  float(p.price_min) if p else None,
            "price_max":  float(p.price_max) if p else None,
            "hours_min":  h.hours_min if h else None,
            "hours_max":  h.hours_max if h else None,
        })
    return out


@router.post("/me/photo", response_model=UserOut, summary="Upload profile photo")
async def upload_my_photo(
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Accepts JPEG / PNG / WebP.
    Image is resized to max 300×300 and re-encoded as JPEG at 80 % quality
    before being written to disk, keeping file sizes small (~20-50 KB).
    The relative path is stored in users.profile_photo.
    The frontend builds the full URL as  <BASE_URL>/<profile_photo>.
    """
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if photo.content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Only JPEG, PNG or WebP images are allowed.",
        )

    data = await photo.read()
    if len(data) > MAX_AVATAR_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded image is too large.")

    try:
        img = PilImage.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read image file.")

    img.thumbnail((300, 300), PilImage.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80, optimize=True)
    buf.seek(0)

    filename = f"{uuid.uuid4()}.jpg"
    file_path = os.path.join(AVATAR_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(buf.read())

    # Remove old avatar file if it was locally stored
    old = current_user.profile_photo
    if old and old.startswith("uploads/avatars/"):
        try:
            os.remove(safe_upload_path(old, AVATAR_ROOT))
        except OSError:
            pass

    current_user.profile_photo = f"uploads/avatars/{filename}"
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get(
    "/{user_id}",
    response_model=UserOut,
    summary="Get user by ID (admin only)",
)
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user
