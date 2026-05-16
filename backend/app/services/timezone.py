from datetime import datetime
import re
import pytz


# Map ISO language codes (and a few common names) to the IANA timezone of the
# country where that language is primarily spoken. Used to default a tutor's
# timezone based on the language they teach, since e.g. an Italian tutor
# almost certainly lives in Italy.
LANGUAGE_TIMEZONE_MAP = {
    "it":  "Europe/Rome",
    "es":  "Europe/Madrid",
    "fr":  "Europe/Paris",
    "de":  "Europe/Berlin",
    "pt":  "Europe/Lisbon",
    "ru":  "Europe/Moscow",
    "en":  "Europe/London",
    "nl":  "Europe/Amsterdam",
    "sv":  "Europe/Stockholm",
    "pl":  "Europe/Warsaw",
    "tr":  "Europe/Istanbul",
    "el":  "Europe/Athens",
    "uk":  "Europe/Kyiv",
    "cs":  "Europe/Prague",
    "hu":  "Europe/Budapest",
    "ro":  "Europe/Bucharest",
    "bg":  "Europe/Sofia",
    "hr":  "Europe/Zagreb",
    "ja":  "Asia/Tokyo",
    "ko":  "Asia/Seoul",
    "zh":  "Asia/Shanghai",
    "ar":  "Asia/Dubai",
    "hi":  "Asia/Kolkata",
    "th":  "Asia/Bangkok",
    "vi":  "Asia/Ho_Chi_Minh",
    "id":  "Asia/Jakarta",
    "he":  "Asia/Jerusalem",
    "fa":  "Asia/Tehran",
}

LOCATION_TIMEZONE_MAP = {
    "albania": "Europe/Tirane",
    "tirana": "Europe/Tirane",
    "italy": "Europe/Rome",
    "rome": "Europe/Rome",
    "milan": "Europe/Rome",
    "spain": "Europe/Madrid",
    "madrid": "Europe/Madrid",
    "france": "Europe/Paris",
    "paris": "Europe/Paris",
    "germany": "Europe/Berlin",
    "berlin": "Europe/Berlin",
    "portugal": "Europe/Lisbon",
    "lisbon": "Europe/Lisbon",
    "united kingdom": "Europe/London",
    "uk": "Europe/London",
    "england": "Europe/London",
    "london": "Europe/London",
    "ireland": "Europe/Dublin",
    "dublin": "Europe/Dublin",
    "netherlands": "Europe/Amsterdam",
    "amsterdam": "Europe/Amsterdam",
    "sweden": "Europe/Stockholm",
    "stockholm": "Europe/Stockholm",
    "poland": "Europe/Warsaw",
    "warsaw": "Europe/Warsaw",
    "turkey": "Europe/Istanbul",
    "istanbul": "Europe/Istanbul",
    "greece": "Europe/Athens",
    "athens": "Europe/Athens",
    "ukraine": "Europe/Kyiv",
    "kyiv": "Europe/Kyiv",
    "russia": "Europe/Moscow",
    "moscow": "Europe/Moscow",
    "japan": "Asia/Tokyo",
    "tokyo": "Asia/Tokyo",
    "south korea": "Asia/Seoul",
    "korea": "Asia/Seoul",
    "seoul": "Asia/Seoul",
    "china": "Asia/Shanghai",
    "beijing": "Asia/Shanghai",
    "shanghai": "Asia/Shanghai",
    "india": "Asia/Kolkata",
    "delhi": "Asia/Kolkata",
    "mumbai": "Asia/Kolkata",
    "united arab emirates": "Asia/Dubai",
    "uae": "Asia/Dubai",
    "dubai": "Asia/Dubai",
    "thailand": "Asia/Bangkok",
    "bangkok": "Asia/Bangkok",
    "vietnam": "Asia/Ho_Chi_Minh",
    "indonesia": "Asia/Jakarta",
    "israel": "Asia/Jerusalem",
    "iran": "Asia/Tehran",
    "canada": "America/Toronto",
    "toronto": "America/Toronto",
    "vancouver": "America/Vancouver",
    "mexico": "America/Mexico_City",
    "mexico city": "America/Mexico_City",
    "brazil": "America/Sao_Paulo",
    "sao paulo": "America/Sao_Paulo",
    "argentina": "America/Argentina/Buenos_Aires",
    "buenos aires": "America/Argentina/Buenos_Aires",
    "united states": "America/New_York",
    "usa": "America/New_York",
    "us": "America/New_York",
    "america": "America/New_York",
    "washington dc": "America/New_York",
    "washington d c": "America/New_York",
    "washington, dc": "America/New_York",
    "new york": "America/New_York",
    "boston": "America/New_York",
    "miami": "America/New_York",
    "chicago": "America/Chicago",
    "dallas": "America/Chicago",
    "denver": "America/Denver",
    "phoenix": "America/Phoenix",
    "los angeles": "America/Los_Angeles",
    "san francisco": "America/Los_Angeles",
    "seattle": "America/Los_Angeles",
}


def _normalize_lookup(value: str | None) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\b(washington)\s*d\.?\s*c\.?\b", r"\1 dc", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def timezone_for_language(code_or_name: str | None) -> str | None:
    """
    Resolve the canonical timezone for a tutor based on the language they
    teach. Accepts an ISO code ("it") or a display name ("Italian").
    Returns None when we don't have a mapping.
    """
    if not code_or_name:
        return None
    key = str(code_or_name).strip().lower()
    if key in LANGUAGE_TIMEZONE_MAP:
        return LANGUAGE_TIMEZONE_MAP[key]
    # Allow passing the full name ("Italian", "Spanish", …)
    NAME_MAP = {
        "italian":    "Europe/Rome",
        "spanish":    "Europe/Madrid",
        "french":     "Europe/Paris",
        "german":     "Europe/Berlin",
        "portuguese": "Europe/Lisbon",
        "russian":    "Europe/Moscow",
        "english":    "Europe/London",
        "dutch":      "Europe/Amsterdam",
        "swedish":    "Europe/Stockholm",
        "polish":     "Europe/Warsaw",
        "turkish":    "Europe/Istanbul",
        "greek":      "Europe/Athens",
        "ukrainian":  "Europe/Kyiv",
        "czech":      "Europe/Prague",
        "hungarian":  "Europe/Budapest",
        "romanian":   "Europe/Bucharest",
        "bulgarian":  "Europe/Sofia",
        "croatian":   "Europe/Zagreb",
        "japanese":   "Asia/Tokyo",
        "korean":     "Asia/Seoul",
        "chinese":    "Asia/Shanghai",
        "mandarin":   "Asia/Shanghai",
        "arabic":     "Asia/Dubai",
        "hindi":      "Asia/Kolkata",
        "thai":       "Asia/Bangkok",
        "vietnamese": "Asia/Ho_Chi_Minh",
        "indonesian": "Asia/Jakarta",
        "hebrew":     "Asia/Jerusalem",
        "persian":    "Asia/Tehran",
        "farsi":      "Asia/Tehran",
    }
    return NAME_MAP.get(key)


def timezone_for_location(location: str | None) -> str | None:
    """
    Resolve a student's typed city/country into an IANA timezone.
    Accepts direct IANA values too, so "America/New_York" is valid input.
    """
    if not location:
        return None
    raw = str(location).strip()
    if is_valid_timezone(raw):
        return raw

    normalized = _normalize_lookup(raw)
    if not normalized:
        return None
    if normalized in LOCATION_TIMEZONE_MAP:
        return LOCATION_TIMEZONE_MAP[normalized]

    parts = [part.strip() for part in normalized.split(" ") if part.strip()]
    for end in range(len(parts), 0, -1):
        candidate = " ".join(parts[:end])
        if candidate in LOCATION_TIMEZONE_MAP:
            return LOCATION_TIMEZONE_MAP[candidate]
    for start in range(1, len(parts)):
        candidate = " ".join(parts[start:])
        if candidate in LOCATION_TIMEZONE_MAP:
            return LOCATION_TIMEZONE_MAP[candidate]
    return None


def resolve_student_timezone(location: str | None, fallback_timezone: str | None = None) -> str:
    location_tz = timezone_for_location(location)
    if location_tz:
        return location_tz
    if fallback_timezone and is_valid_timezone(fallback_timezone):
        return fallback_timezone
    return "UTC"


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
