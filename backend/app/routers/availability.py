from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from database import get_db
from models.teacher import AvailabilitySlot
from models.users import User
from models.teacher import Teacher
from utils.timezone import to_utc, from_utc, is_valid_timezone
from pydantic import BaseModel
from datetime import time
import uuid

router = APIRouter()
class AvailabilityCreate(BaseModel):
    day_of_week: int        
    start_time: time   
    end_time: time      
    timezone: str          


class AvailabilityResponse(BaseModel):
    id: str
    day_of_week: int
    start_time: time
    end_time: time
    timezone: str
    is_active: bool

    class Config:
        from_attributes = True
DAYS = {
    0: "Monday",
    1: "Tuesday",
    2: "Wednesday",
    3: "Thursday",
    4: "Friday",
    5: "Saturday",
    6: "Sunday"
}
@router.post("/")
def add_availability(
    data: AvailabilityCreate,
    teacher_id: str,
    db: Session = Depends(get_db)
):
    if not is_valid_timezone(data.timezone):
        raise HTTPException(status_code=400, detail="Timezone is not correct!")
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")
    conflict = db.query(AvailabilitySlot).filter(
        and_(
            AvailabilitySlot.teacher_id == teacher_id,
            AvailabilitySlot.day_of_week == data.day_of_week,
            AvailabilitySlot.is_active == True,
            AvailabilitySlot.start_time < data.end_time,
            AvailabilitySlot.end_time > data.start_time
        )
    ).first()

    if conflict:
        raise HTTPException(
            status_code=400,
            detail=f"You have a session {DAYS[data.day_of_week]} from {conflict.start_time} to {conflict.end_time}"
        )
    slot = AvailabilitySlot(
        id=uuid.uuid4(),
        teacher_id=teacher_id,
        day_of_week=data.day_of_week,
        start_time=data.start_time,
        end_time=data.end_time,
        timezone=data.timezone,
        is_active=True
    )

    db.add(slot)
    db.commit()
    db.refresh(slot)

    return {
        "message": "Availability slot added successfully!",
        "slot": {
            "id": str(slot.id),
            "day": DAYS[data.day_of_week],
            "start_time": str(slot.start_time),
            "end_time": str(slot.end_time),
            "timezone": slot.timezone
        }
    }
@router.get("/{teacher_id}")
def get_teacher_availability(
    teacher_id: str,
    student_timezone: str = "UTC",
    db: Session = Depends(get_db)
):
    if not is_valid_timezone(student_timezone):
        raise HTTPException(status_code=400, detail="Timezone is not correct!")
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found!")
    slots = db.query(AvailabilitySlot).filter(
        and_(
            AvailabilitySlot.teacher_id == teacher_id,
            AvailabilitySlot.is_active == True
        )
    ).all()

    if not slots:
        return {"message": "Teacher has no available slots!", "slots": []}
    result = []
    for slot in slots:
        from datetime import datetime, date
        today = date.today()

        start_dt = datetime.combine(today, slot.start_time)
        end_dt = datetime.combine(today, slot.end_time)

        from utils.timezone import convert_teacher_slot_for_student
        student_start = convert_teacher_slot_for_student(
            start_dt,
            slot.timezone,
            student_timezone
        )
        student_end = convert_teacher_slot_for_student(
            end_dt,
            slot.timezone,
            student_timezone
        )

        result.append({
            "id": str(slot.id),
            "day": DAYS[slot.day_of_week],
            "teacher_time": {
                "start": str(slot.start_time),
                "end": str(slot.end_time),
                "timezone": slot.timezone
            },
            "your_time": {
                "start": student_start.strftime("%H:%M"),
                "end": student_end.strftime("%H:%M"),
                "timezone": student_timezone
            }
        })

    return {
        "teacher_id": teacher_id,
        "slots": result
    }
@router.delete("/{slot_id}")
def delete_availability(
    slot_id: str,
    teacher_id: str,
    db: Session = Depends(get_db)
):
    slot = db.query(AvailabilitySlot).filter(
        and_(
            AvailabilitySlot.id == slot_id,
            AvailabilitySlot.teacher_id == teacher_id
        )
    ).first()

    if not slot:
        raise HTTPException(status_code=404, detail="Availability slot not found!")

    slot.is_active = False
    db.commit()

    return {"message": "Availability slot deleted successfully!"}
@router.put("/{slot_id}")
def update_availability(
    slot_id: str,
    teacher_id: str,
    data: AvailabilityCreate,
    db: Session = Depends(get_db)
):
    if not is_valid_timezone(data.timezone):
        raise HTTPException(status_code=400, detail="Timezone is not correct!")

    slot = db.query(AvailabilitySlot).filter(
        and_(
            AvailabilitySlot.id == slot_id,
            AvailabilitySlot.teacher_id == teacher_id
        )
    ).first()

    if not slot:
        raise HTTPException(status_code=404, detail="Availability slot not found!")

    slot.day_of_week = data.day_of_week
    slot.start_time  = data.start_time
    slot.end_time    = data.end_time
    slot.timezone    = data.timezone

    db.commit()
    db.refresh(slot)

    return {
        "message": "Availability slot updated successfully!",
        "slot": {
            "id": str(slot.id),
            "day": DAYS[data.day_of_week],
            "start_time": str(slot.start_time),
            "end_time": str(slot.end_time),
            "timezone": slot.timezone
        }
    }