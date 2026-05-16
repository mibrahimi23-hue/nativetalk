"""
Daily.co REST API wrapper.

Docs: https://docs.daily.co/reference/rest-api

Used by:
  POST /api/v1/sessions/{session_id}/daily/room   → create or get a room
  POST /api/v1/sessions/{session_id}/daily/token  → create a meeting token

React Native integration:
  import DailyIframe from '@daily-co/react-native-daily-js';
  const call = DailyIframe.createCallObject();
  await call.join({ url: room_url, token: meeting_token });

If DAILY_API_KEY is not configured, all methods raise HTTP 503 with a helpful
message pointing to the README configuration section.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

import httpx
from fastapi import HTTPException

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("nativetalk.daily")
settings = get_settings()
EJECT_ON_EXPIRY_FIELD = "eject_at_" + "token_exp"


def _require_key() -> str:
    if not settings.DAILY_API_KEY:
        raise HTTPException(
            status_code=503,
            detail=(
                "Daily API key not configured. "
                "Set DAILY_API_KEY in your .env file. "
                "See README.md → 'Daily.co Setup' for instructions."
            ),
        )
    return settings.DAILY_API_KEY


class DailyClient:
    """Thin synchronous wrapper around the Daily.co REST API."""

    def __init__(self) -> None:
        self._base = settings.DAILY_API_URL.rstrip("/")

    def _headers(self) -> Dict[str, str]:
        key = _require_key()
        return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    # ── Rooms ────────────────────────────────────────────────────────────────

    def get_or_create_room(self, room_name: str, exp_seconds: int = 7200) -> Dict[str, Any]:
        """
        Get an existing Daily room by name, or create it if absent.

        Args:
            room_name:    Unique identifier for this session's room.
            exp_seconds:  Room expiry in seconds from now (default 2 hours).

        Returns dict with at least: name, url
        """
        # Try to fetch first
        with httpx.Client(timeout=10) as client:
            r = client.get(
                f"{self._base}/rooms/{room_name}",
                headers=self._headers(),
            )

        if r.status_code == 200:
            logger.info("Daily room exists: %s", room_name)
            return r.json()

        if r.status_code == 404:
            return self._create_room(room_name, exp_seconds)

        _raise_daily_error(r)

    def _create_room(self, room_name: str, exp_seconds: int) -> Dict[str, Any]:
        import time
        payload: Dict[str, Any] = {
            "name": room_name,
            "privacy": "private",
            "properties": {
                "exp": int(time.time()) + exp_seconds,
                "enable_screenshare": False,
                "enable_chat": True,
                "enable_knocking": True,
                "start_video_off": False,
                "start_audio_off": False,
                "max_participants": 2,
            },
        }
        with httpx.Client(timeout=10) as client:
            r = client.post(
                f"{self._base}/rooms",
                headers=self._headers(),
                json=payload,
            )
        if r.status_code not in (200, 201):
            _raise_daily_error(r)
        data = r.json()
        logger.info("Daily room created: %s  url=%s", data.get("name"), data.get("url"))
        return data

    def delete_room(self, room_name: str) -> None:
        """Delete a Daily room so every participant is removed from the call."""
        with httpx.Client(timeout=10) as client:
            r = client.delete(
                f"{self._base}/rooms/{room_name}",
                headers=self._headers(),
            )
        if r.status_code not in (200, 202, 204, 404):
            _raise_daily_error(r)
        logger.info("Daily room deleted: %s", room_name)

    # ── Meeting tokens ───────────────────────────────────────────────────────

    def create_meeting_token(
        self,
        room_name: str,
        user_id: str,
        user_name: str,
        is_owner: bool = False,
        exp_seconds: int = 7200,
        nbf_seconds: int = 0,
    ) -> str:
        """
        Create a short-lived meeting token for a single participant.

        Security properties applied:
        - `user_id` bound to the token (Daily.co enforces identity)
        - `eject_at_token_exp: true` → user is auto-kicked when token expires
        - `nbf` (not-before) → token is invalid before the session window opens
        - `exp` → token is invalid after the session ends

        React Native joins with:
          call.join({ url: room_url, token: meeting_token })
        """
        import time
        now = int(time.time())
        payload: Dict[str, Any] = {
            "properties": {
                "room_name": room_name,
                "user_id": user_id,
                "user_name": user_name,
                "is_owner": is_owner,
                "exp": now + exp_seconds,
                "nbf": now + nbf_seconds,          # not usable before this time
                EJECT_ON_EXPIRY_FIELD: True,
                "enable_recording": False,
            }
        }
        with httpx.Client(timeout=10) as client:
            r = client.post(
                f"{self._base}/meeting-tokens",
                headers=self._headers(),
                json=payload,
            )
        if r.status_code not in (200, 201):
            _raise_daily_error(r)
        token: str = r.json()["token"]
        logger.info("Daily meeting token created for user=%s room=%s", user_id, room_name)
        return token


def _raise_daily_error(response: httpx.Response) -> None:
    try:
        detail = response.json().get("info", response.text)
    except Exception:
        detail = response.text
    raise HTTPException(
        status_code=502,
        detail=f"Daily.co API error ({response.status_code}): {detail}",
    )


# Module-level singleton — instantiated lazily
_client: Optional[DailyClient] = None


def get_daily_client() -> DailyClient:
    global _client
    if _client is None:
        _client = DailyClient()
    return _client
