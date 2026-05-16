"""add_payment_plan_to_teachers

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-14 15:30:00.000000

Tutors pick a preferred payment plan during onboarding (hour_by_hour,
50_50 or 80_20). The student's booking flow uses this plan instead of
letting the student choose, so the tutor is paid the way they want.

Default is "hour_by_hour" so existing rows stay safe.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'teachers',
        sa.Column(
            'payment_plan',
            sa.String(length=20),
            nullable=False,
            server_default='hour_by_hour',
        ),
    )


def downgrade() -> None:
    op.drop_column('teachers', 'payment_plan')
