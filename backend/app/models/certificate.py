from sqlalchemy import Column, String, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base
import uuid


class TeacherCertificate(Base):
    __tablename__ = "teacher_certificates"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id   = Column(UUID(as_uuid=True), ForeignKey("teachers.id"), nullable=False)
    name         = Column(String(100), nullable=False)
    file_path    = Column(String(255), nullable=False)
    is_notarized = Column(Boolean, default=False)
    is_verified  = Column(Boolean, default=False)
    uploaded_at  = Column(TIMESTAMP(timezone=True), server_default=func.now())

    teacher = relationship("Teacher", back_populates="certificates")
