"""
Google ID token verification service.

Flow (React Native → Backend):
  1. React Native calls GoogleSignin.signIn() → gets idToken (a JWT signed by Google).
  2. React Native POSTs { "id_token": idToken } to POST /api/v1/auth/google.
  3. Backend verifies the token with google-auth-library (no client secret needed).
  4. Backend upserts user and returns our own access + refresh tokens.

Why this flow?
  - It works with only GOOGLE_CLIENT_ID — no client secret required.
  - The ID token self-contains email/name/picture and is verifiable via Google's
    public keys (fetched automatically by google-auth).
  - Suitable for mobile apps; the authorization-code flow is NOT used.
"""
from __future__ import annotations

import time
from typing import Any, Dict

from fastapi import HTTPException
from google.auth.exceptions import TransportError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("nativetalk.google_auth")
settings = get_settings()


def verify_google_id_token(token: str) -> Dict[str, Any]:
    """
    Verify a Google ID token and return the claims dict.

    Returns dict with keys: sub, email, name, picture, email_verified, ...

    Raises HTTPException(401) on invalid / expired token.
    Raises HTTPException(503) if Google's public keys can't be fetched
    after a few retries (network / firewall blip on the backend host).
    """
    # The google-auth library fetches Google's public certs over HTTPS the
    # first time `verify_oauth2_token` is called. On Windows that occasionally
    # gets aborted by the local TLS stack / antivirus (WinError 10053). Retry
    # a couple of times with a small backoff before surfacing a 503 — the
    # next-attempt success rate is high.
    # Accept tokens from any of the configured client IDs (web + native
    # platforms). Each platform uses its own Google OAuth client, and Google
    # signs the `aud` claim with the requesting client ID — so we check the
    # token against all of ours.
    expected_audiences = [
        aud for aud in (
            settings.GOOGLE_CLIENT_ID,
            getattr(settings, "GOOGLE_ANDROID_CLIENT_ID", ""),
            getattr(settings, "GOOGLE_IOS_CLIENT_ID", ""),
        )
        if aud
    ]

    last_transport_error: TransportError | None = None
    last_value_error: ValueError | None = None
    claims = None
    for attempt in range(3):
        for audience in expected_audiences:
            try:
                claims = google_id_token.verify_oauth2_token(
                    token,
                    google_requests.Request(),
                    audience=audience,
                )
                last_value_error = None
                break
            except TransportError as exc:
                last_transport_error = exc
                logger.warning(
                    "Google cert fetch failed (attempt %d/3, aud=%s): %s",
                    attempt + 1, audience, exc,
                )
                time.sleep(0.4 * (attempt + 1))
                claims = None
                break  # network problem, retry the whole audience list
            except ValueError as exc:
                # `aud` mismatch lands here too — try the next configured id.
                last_value_error = exc
                continue
        if claims is not None:
            break
        if last_value_error is not None and last_transport_error is None:
            # All audiences exhausted with non-transport errors — bail out.
            logger.warning("Google token verification failed: %s", last_value_error)
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired Google ID token. Ensure you are passing the idToken "
                       "(not the accessToken) from @react-native-google-signin/google-signin.",
            ) from last_value_error
    else:
        # Loop exhausted without `break` — all retries hit network errors.
        logger.error(
            "Google ID token verification gave up after 3 transport errors: %s",
            last_transport_error,
        )
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not reach Google to verify the sign-in token. "
                "This usually means a firewall, antivirus, or network proxy on "
                "the server is blocking HTTPS to googleapis.com. Try again in "
                "a moment, or check the server's outbound HTTPS connectivity."
            ),
        ) from last_transport_error

    # Extra safety: validate issuer
    if claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=401, detail="Invalid Google token issuer.")

    email = claims.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Google token missing email claim.")

    if not claims.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Google email address is not verified.")

    logger.info("Google token verified for %s (sub=%s)", email, claims.get("sub"))
    return claims
