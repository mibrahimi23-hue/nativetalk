from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class TeacherProfileOut(BaseModel):
    id:            UUID
    user_id:       UUID
    language_id:   int
    is_native:     bool
    is_certified:  bool
    has_experience: bool
    max_level:     str
    is_verified:   bool
    passed_exam:   bool
    bio:           Optional[str] = None
    hourly_rate:   Optional[float] = None
    payment_plan:  str = "hour_by_hour"
    # User-sourced fields (populated by the endpoint)
    full_name:     Optional[str] = None
    profile_photo: Optional[str] = None
    email:         Optional[str] = None
    language_name: Optional[str] = None

    model_config = {"from_attributes": True}


class TeacherUpdate(BaseModel):
    bio:           Optional[str]  = None
    hourly_rate:   Optional[int]  = None
    is_certified:  Optional[bool] = None
    has_experience: Optional[bool] = None
    payment_plan:  Optional[str]  = None   # "hour_by_hour" | "50_50" | "80_20"


class TeacherOnboardingRequest(BaseModel):
    """
    Used by Google-authenticated users (and any existing user already holding
    role='teacher') to create the missing Teacher row. The Teacher table
    requires a language_id, which is not collected during Google sign-in, so
    the frontend posts to this endpoint after the user picks language and
    certification level.
    """
    language_id:    int
    is_native:      Optional[bool] = None
    is_certified:   Optional[bool] = None
    has_experience: Optional[bool] = None
    bio:            Optional[str]  = None


class AvailabilityCreate(BaseModel):
    """
    React Native sends this when a teacher sets their weekly availability.
    day_of_week: 0=Monday … 6=Sunday
    start_time / end_time: "HH:MM:SS" strings (Python time format)
    timezone: IANA timezone, e.g. "Europe/Madrid"
    """
    day_of_week: int
    start_time:  str
    end_time:    str
    timezone:    str


class AvailabilityOut(BaseModel):
    id:          UUID
    day_of_week: int
    start_time:  str
    end_time:    str
    timezone:    str
    is_active:   Optional[bool] = None

    model_config = {"from_attributes": True}


class PaginatedTutorResponse(BaseModel):
    items:  List[TeacherProfileOut]
    total:  int
    limit:  int
    offset: int
