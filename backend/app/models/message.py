import uuid
from sqlalchemy import Boolean, Column, ForeignKey, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class Message(Base):
    """Direct messages between platform users (student ↔ teacher).

    `sender_id` / `receiver_id` use ON DELETE CASCADE — when a user account is
    hard-deleted (directly in the database or via /admin/users/{id}), their
    chat rows go with them automatically instead of blocking the deletion
    with a foreign-key constraint violation.
    """
    __tablename__ = "messages"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_id   = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    receiver_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content     = Column(Text, nullable=False)
    liked       = Column(Boolean, default=False)
    is_read     = Column(Boolean, default=False)
    created_at  = Column(TIMESTAMP(timezone=True), server_default=func.now())

    sender   = relationship("User", foreign_keys=[sender_id])
    receiver = relationship("User", foreign_keys=[receiver_id])
