from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from app.db.session import get_db
from app.models.users import User
from app.models.teacher import Teacher, AvailabilitySlot
from app.models.student import Student, StudentLanguage
from app.models.language import Language
from app.models.review import Review
from app.models.session import Session as BookingSession
from app.services.timezone import is_valid_timezone, resolve_student_timezone, timezone_for_language
from pydantic import BaseModel
from datetime import time
import uuid

router = APIRouter()


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    timezone:  str | None = None
    location:  str | None = None
    bio:       str | None = None


class AddAvailabilityRequest(BaseModel):
    day_of_week: int    # 0=Monday ... 6=Sunday
    start_time:  str    # "09:00"
    end_time:    str    # "10:00"
    timezone:    str


def _parse_availability(data: AddAvailabilityRequest) -> tuple[time, time]:
    if data.day_of_week < 0 or data.day_of_week > 6:
        raise HTTPException(status_code=400, detail="day_of_week must be between 0 and 6.")
    if not is_valid_timezone(data.timezone):
        raise HTTPException(status_code=400, detail="Timezone is not correct!")

    try:
        start = time.fromisoformat(data.start_time)
        end = time.fromisoformat(data.end_time)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format.")

    if start >= end:
        raise HTTPException(status_code=400, detail="Start time must be before end time!")

    return start, end


def _availability_conflict(
    db: DBSession,
    teacher_id: str,
    data: AddAvailabilityRequest,
    start: time,
    end: time,
    exclude_slot_id: str | None = None,
) -> AvailabilitySlot | None:
    query = db.query(AvailabilitySlot).filter(
        AvailabilitySlot.teacher_id == teacher_id,
        AvailabilitySlot.day_of_week == data.day_of_week,
        AvailabilitySlot.is_active == True,
        AvailabilitySlot.start_time < end,
        AvailabilitySlot.end_time > start,
    )
    if exclude_slot_id:
        query = query.filter(AvailabilitySlot.id != exclude_slot_id)
    return query.first()


@router.get("/student/{student_id}")
def get_student_profile(
    student_id: str,
    db: DBSession = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found!")

    user = db.query(User).filter(User.id == student.user_id).first()

    languages = db.query(StudentLanguage).filter(
        StudentLanguage.student_id == student_id
    ).all()

    total_sessions = db.query(BookingSession).filter(
        and_(
            BookingSession.student_id == student_id,
            BookingSession.status == "completed"
        )
    ).count()

    return {
        "student_id":      str(student.id),
        "full_name":       user.full_name,
        "email":           user.email,
        "timezone":        user.timezone,
        "location":        user.location,
        "current_level":   student.current_level,
        "total_sessions":  total_sessions,
        "reschedule_count": student.reschedule_count,
        "languages": [
            {
                "language_id": sl.language_id,
                "level":       sl.level,
                "started_at":  str(sl.started_at)
            }
            for sl in languages
        ]
    }


@router.patch("/student/{student_id}")
def update_student_profile(
    student_id: str,
    data: UpdateProfileRequest,
    db: DBSession = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found!")

    user = db.query(User).filter(User.id == student.user_id).first()

    if data.full_name:
        user.full_name = data.full_name
    if data.location:
        user.location = data.location
    if data.timezone:
        user.timezone = resolve_student_timezone(user.location, data.timezone)
    elif data.location:
        user.timezone = resolve_student_timezone(user.location, user.timezone)

    db.commit()

    return {
        "message":   "Profile updated!",
        "full_name": user.full_name,
        "timezone":  user.timezone,
        "location":  user.location,
    }


@router.get("/teacher/{teacher_id}")
def get_teacher_profile(
    teacher_id: str,
    db: DBSession = Depends(get_db)
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")

    user = db.query(User).filter(User.id == teacher.user_id).first()
    language = db.query(Language).filter(Language.id == teacher.language_id).first()

    reviews = db.query(Review).filter(
        and_(Review.teacher_id == teacher.id, Review.role == "student")
    ).all()
    avg_rating = round(sum(r.rating for r in reviews) / len(reviews), 2) if reviews else 0

    total_sessions = db.query(BookingSession).filter(
        and_(
            BookingSession.teacher_id == teacher_id,
            BookingSession.status == "completed"
        )
    ).count()

    slots = db.query(AvailabilitySlot).filter(
        and_(
            AvailabilitySlot.teacher_id == teacher_id,
            AvailabilitySlot.is_active == True
        )
    ).all()

    days_map = {
        0: "Monday", 1: "Tuesday", 2: "Wednesday",
        3: "Thursday", 4: "Friday", 5: "Saturday", 6: "Sunday"
    }

    return {
        "teacher_id":     str(teacher.id),
        "full_name":      user.full_name,
        "email":          user.email,
        "timezone":       user.timezone,
        "location":       user.location,
        "bio":            teacher.bio,
        "language":       {"id": language.id, "name": language.name},
        "is_native":      teacher.is_native,
        "is_certified":   teacher.is_certified,
        "has_experience": teacher.has_experience,
        "max_level":      teacher.max_level,
        "is_verified":    teacher.is_verified,
        "avg_rating":     avg_rating,
        "total_reviews":  len(reviews),
        "total_sessions": total_sessions,
        "availability": [
            {
                "id":         str(s.id),
                "day":        days_map.get(s.day_of_week),
                "start_time": str(s.start_time),
                "end_time":   str(s.end_time),
                "timezone":   s.timezone
            }
            for s in slots
        ]
    }


@router.patch("/teacher/{teacher_id}")
def update_teacher_profile(
    teacher_id: str,
    data: UpdateProfileRequest,
    db: DBSession = Depends(get_db)
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")

    user = db.query(User).filter(User.id == teacher.user_id).first()

    if data.full_name:
        user.full_name = data.full_name
    if data.location:
        user.location = data.location
    language = db.query(Language).filter(Language.id == teacher.language_id).first()
    teaching_timezone = (
        timezone_for_language(language.code) or timezone_for_language(language.name)
        if language
        else None
    )
    if teaching_timezone:
        user.timezone = teaching_timezone
    elif data.timezone:
        user.timezone = data.timezone
    if data.bio:
        teacher.bio = data.bio

    db.commit()

    return {
        "message":   "Profile updated!",
        "full_name": user.full_name,
        "timezone":  user.timezone,
        "location":  user.location,
        "bio":       teacher.bio
    }


@router.post("/teacher/{teacher_id}/availability")
def add_availability(
    teacher_id: str,
    data: AddAvailabilityRequest,
    db: DBSession = Depends(get_db)
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")

    start, end = _parse_availability(data)

    conflict = _availability_conflict(db, teacher_id, data, start, end)
    if conflict:
        raise HTTPException(
            status_code=400,
            detail=f"Overlaps with existing slot from {conflict.start_time} to {conflict.end_time}.",
        )

    user = db.query(User).filter(User.id == teacher.user_id).first()
    language = db.query(Language).filter(Language.id == teacher.language_id).first()
    slot_timezone = (
        timezone_for_language(language.code) or timezone_for_language(language.name)
        if language
        else data.timezone
    )
    if user:
        user.timezone = slot_timezone

    slot = AvailabilitySlot(
        id=uuid.uuid4(),
        teacher_id=teacher_id,
        day_of_week=data.day_of_week,
        start_time=start,
        end_time=end,
        timezone=slot_timezone,
        is_active=True
    )
    db.add(slot)
    db.commit()

    return {
        "message":    "Availability slot added!",
        "slot_id":    str(slot.id),
        "day":        data.day_of_week,
        "start_time": data.start_time,
        "end_time":   data.end_time
    }


@router.put("/teacher/{teacher_id}/availability/{slot_id}")
def update_availability(
    teacher_id: str,
    slot_id:    str,
    data: AddAvailabilityRequest,
    db: DBSession = Depends(get_db)
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")

    slot = db.query(AvailabilitySlot).filter(
        and_(
            AvailabilitySlot.id == slot_id,
            AvailabilitySlot.teacher_id == teacher_id,
            AvailabilitySlot.is_active == True
        )
    ).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found!")

    start, end = _parse_availability(data)
    conflict = _availability_conflict(db, teacher_id, data, start, end, exclude_slot_id=slot_id)
    if conflict:
        raise HTTPException(
            status_code=400,
            detail=f"Overlaps with existing slot from {conflict.start_time} to {conflict.end_time}.",
        )

    user = db.query(User).filter(User.id == teacher.user_id).first()
    language = db.query(Language).filter(Language.id == teacher.language_id).first()
    slot_timezone = (
        timezone_for_language(language.code) or timezone_for_language(language.name)
        if language
        else data.timezone
    )
    if user:
        user.timezone = slot_timezone

    slot.day_of_week = data.day_of_week
    slot.start_time = start
    slot.end_time = end
    slot.timezone = slot_timezone
    db.commit()
    db.refresh(slot)

    return {
        "message": "Availability slot updated!",
        "slot": {
            "id": str(slot.id),
            "day_of_week": slot.day_of_week,
            "start_time": str(slot.start_time),
            "end_time": str(slot.end_time),
            "timezone": slot.timezone,
            "is_active": slot.is_active,
        },
    }


@router.patch("/teacher/{teacher_id}/availability/{slot_id}")
def patch_availability(
    teacher_id: str,
    slot_id:    str,
    data: AddAvailabilityRequest,
    db: DBSession = Depends(get_db)
):
    return update_availability(teacher_id, slot_id, data, db)


@router.delete("/teacher/{teacher_id}/availability/{slot_id}")
def remove_availability(
    teacher_id: str,
    slot_id:    str,
    db: DBSession = Depends(get_db)
):
    slot = db.query(AvailabilitySlot).filter(
        and_(
            AvailabilitySlot.id == slot_id,
            AvailabilitySlot.teacher_id == teacher_id
        )
    ).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found!")

    slot.is_active = False
    db.commit()

    return {"message": "Availability slot removed!"}
