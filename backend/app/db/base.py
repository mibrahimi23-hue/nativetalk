from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

# Import all models so Alembic can detect them
from app.models import (
    certificate,
    exam,
    language,
    material,
    message,
    payment,
    review,
    session,
    student,
    suspension,
    teacher,
    users,
)
