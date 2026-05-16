"""make_exam_created_by_nullable

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-14 02:00:00.000000

The exam admin-builder lets a platform admin (not a Teacher row) author and
publish exams. The original schema required exams.created_by to point at a
Teacher; this migration allows NULL so admin-authored exams are storable.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'exams',
        'created_by',
        existing_type=sa.dialects.postgresql.UUID(as_uuid=True),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'exams',
        'created_by',
        existing_type=sa.dialects.postgresql.UUID(as_uuid=True),
        nullable=False,
    )
