"""
Thin PayPal REST API client.

Docs: https://developer.paypal.com/docs/api/orders/v2/

The frontend never talks to PayPal directly with secrets — it asks our backend
to create an order, the backend returns the PayPal `order_id` plus an
`approval_url` for the user to approve, and the backend captures the order
once the user has approved. This file centralises those three calls.

Configuration (.env):
    PAYPAL_CLIENT_ID      — REST API client id    (sandbox or live)
    PAYPAL_CLIENT_SECRET  — REST API client secret
    PAYPAL_MODE           — "sandbox" (default) or "live"

If the credentials are missing the helpers raise HTTP 503 with a clear
message so the rest of the booking flow keeps working in a "demo" mode.
"""
from __future__ import annotations

import base64
import os
from typing import Any, Dict, Optional

import httpx
from fastapi import HTTPException
from dotenv import load_dotenv

load_dotenv()

PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID", "")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "")
PAYPAL_MODE = os.getenv("PAYPAL_MODE", "sandbox").lower()
# PAYPAL_DEMO_MODE=true forces the simulated flow even when sandbox creds are
# present. Useful while building / demoing the booking flow without having to
# log into a real PayPal sandbox buyer every time.
PAYPAL_DEMO_MODE = os.getenv("PAYPAL_DEMO_MODE", "false").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
PAYPAL_BASE_URL = (
    "https://api-m.sandbox.paypal.com"
    if PAYPAL_MODE != "live"
    else "https://api-m.paypal.com"
)


def is_configured() -> bool:
    """True only when both PayPal credentials are present AND demo mode is off."""
    if PAYPAL_DEMO_MODE:
        return False
    return bool(
        PAYPAL_CLIENT_ID
        and PAYPAL_CLIENT_SECRET
        and "your-paypal" not in PAYPAL_CLIENT_ID
        and "your-paypal" not in PAYPAL_CLIENT_SECRET
    )


def _require_credentials() -> None:
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "PayPal credentials not configured. Set PAYPAL_CLIENT_ID and "
                "PAYPAL_CLIENT_SECRET in your .env file. Sandbox creds are at "
                "https://developer.paypal.com/dashboard/applications/sandbox."
            ),
        )


def _get_access_token() -> str:
    _require_credentials()
    auth = base64.b64encode(
        f"{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}".encode()
    ).decode()
    with httpx.Client(timeout=10) as client:
        r = client.post(
            f"{PAYPAL_BASE_URL}/v1/oauth2/token",
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data="grant_type=client_credentials",
        )
    if r.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"PayPal auth failed ({r.status_code}): {r.text}",
        )
    return r.json()["access_token"]


def create_order(
    amount: float,
    currency: str = "EUR",
    description: str = "NativeTalk lesson",
    return_url: Optional[str] = None,
    cancel_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a PayPal CAPTURE-intent order. Returns:
        {
            "order_id":     "<PayPal id, e.g. 9XJ123456789>",
            "approval_url": "https://www.sandbox.paypal.com/checkoutnow?token=...",
            "raw":          <full PayPal response>,
        }
    """
    token = _get_access_token()
    payload: Dict[str, Any] = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "amount": {
                    "currency_code": currency,
                    "value": f"{amount:.2f}",
                },
                "description": description,
            }
        ],
    }
    if return_url or cancel_url:
        payload["application_context"] = {
            "return_url": return_url or "",
            "cancel_url": cancel_url or "",
            "shipping_preference": "NO_SHIPPING",
            "user_action": "PAY_NOW",
        }
    with httpx.Client(timeout=15) as client:
        r = client.post(
            f"{PAYPAL_BASE_URL}/v2/checkout/orders",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if r.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"PayPal create-order failed ({r.status_code}): {r.text}",
        )
    data = r.json()
    approval_url = next(
        (link["href"] for link in data.get("links", []) if link.get("rel") == "approve"),
        None,
    )
    return {
        "order_id": data.get("id"),
        "approval_url": approval_url,
        "raw": data,
    }


def capture_order(order_id: str) -> Dict[str, Any]:
    """
    Capture (settle) a previously-approved PayPal order. PayPal will refuse
    if the user hasn't approved on their UI first.
    """
    token = _get_access_token()
    with httpx.Client(timeout=15) as client:
        r = client.post(
            f"{PAYPAL_BASE_URL}/v2/checkout/orders/{order_id}/capture",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
    if r.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"PayPal capture failed ({r.status_code}): {r.text}",
        )
    return r.json()
