from datetime import datetime

import pytz

from app.services.timezone import (
    resolve_student_timezone,
    timezone_for_language,
    timezone_for_location,
    to_utc,
)


def test_student_location_resolves_washington_dc():
    assert timezone_for_location("Washington DC, USA") == "America/New_York"
    assert resolve_student_timezone("Washington DC", None) == "America/New_York"


def test_tutor_language_resolves_italy():
    assert timezone_for_language("it") == "Europe/Rome"
    assert timezone_for_language("Italian") == "Europe/Rome"


def test_italy_11am_is_washington_5am_in_winter():
    utc = to_utc(datetime(2026, 1, 15, 11, 0), "Europe/Rome")
    washington = utc.astimezone(pytz.timezone("America/New_York"))
    assert washington.hour == 5
    assert washington.minute == 0
