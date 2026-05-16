"""
API v1 central router — aggregates all endpoint routers under /api/v1.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.v1.endpoints import (
    admin,
    auth,
    chat,
    health,
    payments,
    reviews,
    sessions,
    tutors,
    users,
)
from app.db.session import get_db
from app.models.language import Language

# Single top-level router for the entire v1 API
api_router = APIRouter(prefix="/api/v1")

api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(tutors.router)
api_router.include_router(sessions.router)
api_router.include_router(reviews.router)
api_router.include_router(payments.router)
api_router.include_router(chat.router)
api_router.include_router(admin.router)


@api_router.get("/languages", tags=["Languages"], summary="List supported languages")
def list_languages(db: Session = Depends(get_db)):
    """Returns all languages in the platform — used by frontend selectors."""
    languages = db.query(Language).order_by(Language.id).all()
    return [
        {"id": l.id, "name": l.name, "code": l.code}
        for l in languages
    ]
