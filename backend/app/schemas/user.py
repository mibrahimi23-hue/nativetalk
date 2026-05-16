from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, model_validator


class UserUpdate(BaseModel):
    full_name:     Optional[str] = None
    timezone:      Optional[str] = None
    location:      Optional[str] = None
    phone:         Optional[str] = None
    profile_photo: Optional[str] = None
    # Optional learning preferences — applied to the Student / Teacher row when
    # the caller is a learner / tutor.
    language_id:   Optional[int] = None
    level:         Optional[str] = None
    bio:           Optional[str] = None
    hourly_rate:   Optional[float] = None


class UserOut(BaseModel):
    id:            UUID
    email:         str
    full_name:     str
    role:          str
    timezone:      str = "UTC"
    location:      Optional[str] = None
    phone:         Optional[str] = None
    profile_photo: Optional[str] = None
    is_active:     bool
    is_suspended:  bool = False
    teacher_id:    Optional[UUID] = None
    student_id:    Optional[UUID] = None
    # Surfaced from the linked Student / Teacher row so the frontend can render
    # the learner's language + level without a second API hop.
    language_id:   Optional[int] = None
    language_name: Optional[str] = None
    level:         Optional[str] = None
    bio:           Optional[str] = None
    hourly_rate:   Optional[float] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _extract_profile_ids(cls, v):
        """
        When validating from a SQLAlchemy User ORM object, also include the
        linked teacher/student profile ID so the frontend can directly reference
        it without a second API call.
        """
        if isinstance(v, dict):
            return v
        teacher_id = None
        student_id = None
        language_id = None
        language_name = None
        level = None
        bio = None
        hourly_rate = None
        try:
            if v.teacher:
                teacher_id = v.teacher.id
                language_id = v.teacher.language_id
                level = v.teacher.max_level
                bio = v.teacher.bio
                hourly_rate = (
                    float(v.teacher.hourly_rate)
                    if v.teacher.hourly_rate is not None
                    else None
                )
                if v.teacher.language:
                    language_name = v.teacher.language.name
        except Exception:
            teacher_id = None
        try:
            if v.student:
                student_id = v.student.id
                level = v.student.current_level or level
                # Primary language is the first StudentLanguage row
                if v.student.languages:
                    first = v.student.languages[0]
                    language_id = first.language_id
                    if first.language:
                        language_name = first.language.name
        except Exception:
            student_id = None
        return {
            "id": v.id,
            "email": v.email,
            "full_name": v.full_name,
            "role": v.role,
            "timezone": v.timezone or "UTC",
            "location": getattr(v, "location", None),
            "phone": v.phone,
            "profile_photo": v.profile_photo,
            "is_active": v.is_active,
            "is_suspended": v.is_suspended,
            "teacher_id": teacher_id,
            "student_id": student_id,
            "language_id": language_id,
            "language_name": language_name,
            "level": level,
            "bio": bio,
            "hourly_rate": hourly_rate,
        }
