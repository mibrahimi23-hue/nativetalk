from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class BookingCreate(BaseModel):
    """
    React Native sends this to POST /api/v1/bookings/
    after the student selects a teacher, level, time slot and payment plan.
    """
    teacher_id:       str
    student_id:       Optional[str] = None
    language_id:      int
    level:            str              # CEFR: A1 A2 B1 B2 C1 C2
    scheduled_at:     datetime         # ISO-8601, UTC recommended
    student_timezone: str              # e.g. "Europe/Madrid"
    total_hours:      int
    price_per_hour:   float
    payment_plan:     str = "hour_by_hour"   # "hour_by_hour" | "50_50" | "80_20"
    # When the student is using a credit from a tutor-cancelled lesson, the
    # frontend passes the existing CoursePayment id here. The endpoint skips
    # creating a new CoursePayment and re-uses it for the new session.
    course_payment_id: Optional[str] = None


class BookingOut(BaseModel):
    session_id:       str
    course_payment_id: str
    status:           str
    scheduled_at:     datetime
    level:            str
    duration_minutes: int

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    """Full session detail returned by GET /api/v1/sessions/{id}"""
    id:                  str
    teacher_id:          str
    student_id:          str
    course_payment_id:   str
    language_id:         int
    level:               str
    scheduled_at:        datetime
    duration_minutes:    int
    status:              str
    daily_room_url:      Optional[str] = None
    teacher_review_done: bool
    student_review_done: bool
    payment_released:    bool

    model_config = {"from_attributes": True}


class DailyRoomOut(BaseModel):
    """
    Returned when a Daily.co room is created/fetched for a session.
    React Native uses the url to launch the Daily call:
      import DailyIframe from '@daily-co/react-native-daily-js';
      await DailyIframe.createCallObject().join({ url });
    """
    room_name: str
    url:       str
    session_id: str


class DailyTokenOut(BaseModel):
    """
    A short-lived Daily meeting token for one participant.
    React Native joins the call with both the room URL and this token for
    access-controlled rooms.
    """
    token:    str
    room_url: str
    session_id: str
