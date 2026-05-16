from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from app.db.session import get_db
from app.models.teacher import Teacher, AvailabilitySlot
from app.models.users import User
from app.models.language import Language, LevelPricing
from app.models.review import Review

router = APIRouter()

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


@router.get("/languages")
def get_all_languages(db: DBSession = Depends(get_db)):
    languages = db.query(Language).all()
    return {
        "total": len(languages),
        "languages": [
            {"id": l.id, "name": l.name, "code": l.code}
            for l in languages
        ]
    }


@router.get("/levels")
def get_all_levels(db: DBSession = Depends(get_db)):
    pricing = {p.level: p for p in db.query(LevelPricing).all()}
    return {
        "levels": [
            {
                "level": lvl,
                "price_min": float(pricing[lvl].price_min) if lvl in pricing else 0,
                "price_max": float(pricing[lvl].price_max) if lvl in pricing else 0,
                "currency": "EUR",
                "session_duration_minutes": 90 if lvl in ["C1", "C2"] else 60
            }
            for lvl in LEVELS
        ]
    }


@router.get("/teachers")
def search_teachers(
    language_id: int,
    level: str,
    db: DBSession = Depends(get_db)
):
    if level not in LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level! Choose from: A1, A2, B1, B2, C1, C2")

    language = db.query(Language).filter(Language.id == language_id).first()
    if not language:
        raise HTTPException(status_code=404, detail="Language not found!")

    teachers = db.query(Teacher).filter(
        and_(
            Teacher.language_id == language_id,
            Teacher.is_verified == True
        )
    ).all()

    eligible_teachers = [
        t for t in teachers
        if LEVELS.index(t.max_level) >= LEVELS.index(level)
    ]

    if not eligible_teachers:
        return {
            "language": language.name,
            "level": level,
            "total_teachers": 0,
            "teachers": [],
            "message": f"No teachers available for {language.name} at level {level}."
        }

    pricing = db.query(LevelPricing).filter_by(level=level).first()

    result = []
    for teacher in eligible_teachers:
        user = db.query(User).filter(User.id == teacher.user_id).first()

        reviews = db.query(Review).filter(
            and_(
                Review.teacher_id == teacher.id,
                Review.role == "student"
            )
        ).all()
        avg_rating = round(sum(r.rating for r in reviews) / len(reviews), 2) if reviews else 0

        slots = db.query(AvailabilitySlot).filter(
            and_(
                AvailabilitySlot.teacher_id == teacher.id,
                AvailabilitySlot.is_active == True
            )
        ).all()

        days_map = {
            0: "Monday", 1: "Tuesday", 2: "Wednesday",
            3: "Thursday", 4: "Friday", 5: "Saturday", 6: "Sunday"
        }

        availability = [
            {
                "day": days_map.get(s.day_of_week),
                "start_time": str(s.start_time),
                "end_time": str(s.end_time),
                "timezone": s.timezone
            }
            for s in slots
        ]

        result.append({
            "teacher_id": str(teacher.id),
            "full_name": user.full_name,
            "timezone": user.timezone,
            "bio": teacher.bio,
            "is_native": teacher.is_native,
            "is_certified": teacher.is_certified,
            "has_experience": teacher.has_experience,
            "max_level": teacher.max_level,
            "avg_rating": avg_rating,
            "total_reviews": len(reviews),
            "price_range": {
                "min": float(pricing.price_min) if pricing else 0,
                "max": float(pricing.price_max) if pricing else 0,
                "currency": "EUR"
            },
            "availability": availability,
            "session_duration_minutes": 90 if level in ["C1", "C2"] else 60
        })

    result.sort(key=lambda x: x["avg_rating"], reverse=True)

    return {
        "language": language.name,
        "level": level,
        "total_teachers": len(result),
        "price_range": {
            "min": float(pricing.price_min) if pricing else 0,
            "max": float(pricing.price_max) if pricing else 0,
            "currency": "EUR"
        },
        "teachers": result
    }


@router.get("/teacher/{teacher_id}/profile")
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
        and_(
            Review.teacher_id == teacher.id,
            Review.role == "student"
        )
    ).all()
    avg_rating = round(sum(r.rating for r in reviews) / len(reviews), 2) if reviews else 0

    slots = db.query(AvailabilitySlot).filter(
        and_(
            AvailabilitySlot.teacher_id == teacher.id,
            AvailabilitySlot.is_active == True
        )
    ).all()

    days_map = {
        0: "Monday", 1: "Tuesday", 2: "Wednesday",
        3: "Thursday", 4: "Friday", 5: "Saturday", 6: "Sunday"
    }

    teachable_levels = [
        lvl for lvl in LEVELS
        if LEVELS.index(lvl) <= LEVELS.index(teacher.max_level)
    ]

    return {
        "teacher_id": str(teacher.id),
        "full_name": user.full_name,
        "timezone": user.timezone,
        "bio": teacher.bio,
        "language": {
            "id": language.id,
            "name": language.name,
            "code": language.code
        },
        "is_native": teacher.is_native,
        "is_certified": teacher.is_certified,
        "has_experience": teacher.has_experience,
        "max_level": teacher.max_level,
        "teachable_levels": teachable_levels,
        "avg_rating": avg_rating,
        "total_reviews": len(reviews),
        "reviews": [
            {
                "rating": r.rating,
                "comment": r.comment,
                "created_at": str(r.created_at)
            }
            for r in reviews
        ],
        "availability": [
            {
                "day": days_map.get(s.day_of_week),
                "start_time": str(s.start_time),
                "end_time": str(s.end_time),
                "timezone": s.timezone
            }
            for s in slots
        ]
    }