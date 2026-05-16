import uuid
from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class Exam(Base):
    __tablename__ = "exams"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    language_id = Column(Integer, ForeignKey("languages.id"), nullable=False)
    level       = Column(String(3), nullable=False)
    title       = Column(String(100), nullable=False)
    # Nullable: admin-authored exams have no Teacher row to attribute them to.
    created_by  = Column(UUID(as_uuid=True), ForeignKey("teachers.id"), nullable=True)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(TIMESTAMP(timezone=True), server_default=func.now())

    language  = relationship("Language", back_populates="exams")
    creator   = relationship("Teacher", back_populates="exams_created_by_me",
                             foreign_keys=[created_by])
    questions = relationship("ExamQuestion", back_populates="exam")
    attempts  = relationship("ExamAttempt", back_populates="exam")


class ExamQuestion(Base):
    __tablename__ = "exam_questions"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam_id        = Column(UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False)
    question_text  = Column(Text, nullable=False)
    option_a       = Column(String(200), nullable=False)
    option_b       = Column(String(200), nullable=False)
    option_c       = Column(String(200), nullable=False)
    option_d       = Column(String(200), nullable=False)
    correct_answer = Column(String(1), nullable=False)   # "A" | "B" | "C" | "D"
    created_at     = Column(TIMESTAMP(timezone=True), server_default=func.now())

    exam    = relationship("Exam", back_populates="questions")
    answers = relationship("ExamAnswer", back_populates="question")


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam_id      = Column(UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False)
    teacher_id   = Column(UUID(as_uuid=True), ForeignKey("teachers.id"), nullable=False)
    score        = Column(Integer, default=0)
    total        = Column(Integer, default=0)
    passed       = Column(Boolean, default=False)
    completed_at = Column(TIMESTAMP(timezone=True))
    created_at   = Column(TIMESTAMP(timezone=True), server_default=func.now())

    exam    = relationship("Exam", back_populates="attempts")
    teacher = relationship("Teacher", back_populates="exam_attempts")
    answers = relationship("ExamAnswer", back_populates="attempt")


class ExamAnswer(Base):
    __tablename__ = "exam_answers"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attempt_id  = Column(UUID(as_uuid=True), ForeignKey("exam_attempts.id"), nullable=False)
    question_id = Column(UUID(as_uuid=True), ForeignKey("exam_questions.id"), nullable=False)
    answer      = Column(String(1), nullable=False)    # "A" | "B" | "C" | "D"
    is_correct  = Column(Boolean, default=False)
    created_at  = Column(TIMESTAMP(timezone=True), server_default=func.now())

    attempt  = relationship("ExamAttempt", back_populates="answers")
    question = relationship("ExamQuestion", back_populates="answers")
