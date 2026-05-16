from datetime import datetime
import pytz


def to_utc(dt: datetime, user_timezone: str) -> datetime:
    tz = pytz.timezone(user_timezone)
    if dt.tzinfo is None:
        dt = tz.localize(dt)
    return dt.astimezone(pytz.utc)


def from_utc(dt: datetime, user_timezone: str) -> datetime:
    tz = pytz.timezone(user_timezone)
    if dt.tzinfo is None:
        dt = pytz.utc.localize(dt)
    return dt.astimezone(tz)


def now_utc() -> datetime:
    return datetime.now(pytz.utc)


def convert_teacher_slot_for_student(
    teacher_time: datetime,
    teacher_timezone: str,
    student_timezone: str
) -> datetime:
    utc_time = to_utc(teacher_time, teacher_timezone)
    return from_utc(utc_time, student_timezone)


def get_teacher_slots_for_student(
    slots: list,
    teacher_timezone: str,
    student_timezone: str
) -> list:
    converted = []
    for slot in slots:
        converted.append({
            "original_utc":   to_utc(slot["time"], teacher_timezone),
            "teacher_local":  slot["time"],
            "student_local":  convert_teacher_slot_for_student(
                                slot["time"],
                                teacher_timezone,
                                student_timezone
                              )
        })
    return converted


def get_all_timezones() -> list:
    return pytz.all_timezones


def is_valid_timezone(timezone: str) -> bool:
    return timezone in pytz.all_timezones