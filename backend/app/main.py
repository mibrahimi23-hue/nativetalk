from __future__ import annotations
import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# ✅ Fix circular import — load models FIRST before anything else
import app.models.users
import app.models.session
import app.models.payment
import app.models.review
import app.models.teacher
import app.models.student
import app.models.language
import app.models.material
import app.models.exam
import app.models.certificate
import app.models.suspension
import app.models.message

# NativeTalk core
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.db.session import SessionLocal
from app.services.auto_release import auto_release_overdue_payments

# MyProject routers
from app.api import (
    availability,
    booking,
    reschedule,
    suspension,
    exams,
    verifications,
    admin,
    progress,
    videocall,
    certificates,
    materials,
    paypal,
    search,
    lessons,
    profile as profile_router,
)

configure_logging()
logger   = get_logger("nativetalk")
settings = get_settings()


async def _auto_release_scheduler() -> None:
    while True:
        await asyncio.sleep(3600)
        db = SessionLocal()
        try:
            released = auto_release_overdue_payments(db)
            if released:
                logger.info("Auto-release: %d session(s) released.", released)
        except Exception as exc:
            logger.error("Auto-release error: %s", exc, exc_info=True)
        finally:
            db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Merged API starting...")
    task = asyncio.create_task(_auto_release_scheduler())
    yield
    task.cancel()
    logger.info("Merged API shutting down.")


app = FastAPI(
    title="Merged NativeTalk API",
    description="NativeTalk + MyProject merged backend",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ✅ CORS for React Native
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        logger.info("→ %s %s", request.method, request.url.path)
        response = await call_next(request)
        logger.info("← %s", response.status_code)

        # ✅ Log full response body on 400 errors so we can see the exact reason
        if response.status_code == 400:
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            logger.error("← 400 detail: %s", body.decode("utf-8", errors="replace"))
            # Rebuild the response so it still reaches the client
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type,
            )

        return response


app.add_middleware(RequestLoggingMiddleware)

# ✅ NativeTalk routes
app.include_router(api_router)

# ✅ MyProject routes
app.include_router(availability.router,  prefix="/availability",  tags=["Availability"])
app.include_router(booking.router,       prefix="/booking",       tags=["Booking"])
app.include_router(reschedule.router,    prefix="/reschedule",    tags=["Reschedule"])
app.include_router(suspension.router,    prefix="/suspension",    tags=["Suspension"])
app.include_router(exams.router,         prefix="/exams",         tags=["Exams"])
app.include_router(verifications.router, prefix="/verifications", tags=["Verifications"])
app.include_router(admin.router,         prefix="/admin",         tags=["Admin"])
app.include_router(progress.router,      prefix="/progress",      tags=["Progress"])
app.include_router(videocall.router,     prefix="/videocall",     tags=["Video Call"])
app.include_router(certificates.router,  prefix="/certificates",  tags=["Certificates"])
app.include_router(materials.router,     prefix="/materials",     tags=["Materials"])
app.include_router(paypal.router,        prefix="/paypal",        tags=["PayPal"])
app.include_router(search.router,        prefix="/search",        tags=["Search"])
app.include_router(lessons.router,       prefix="/lessons",       tags=["Lessons"])
app.include_router(profile_router.router, prefix="/profile",      tags=["Profile"])

# ✅ Serve uploaded files (avatars, certificates, materials) as static assets
os.makedirs("uploads/avatars", exist_ok=True)
app.mount("/uploads/avatars", StaticFiles(directory="uploads/avatars"), name="avatars")


@app.get("/", include_in_schema=False)
def root():
    return {
        "message": "Merged NativeTalk API running! ✅",
        "docs": "/docs",
        "health": "/api/v1/health",
    }
