"""add_google_id_to_users

Revision ID: a1b2c3d4e5f6
Revises: f30932eeb474
Create Date: 2026-05-13 10:00:00.000000

Adds the google_id column required for Google OAuth sign-in.
The column stores the immutable Google subject identifier ("sub" claim)
returned by Google's ID token verification.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f30932eeb474'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add column only if it doesn't exist
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)")
    
    # Add unique constraint only if it doesn't exist
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_google_id'
            ) THEN
                ALTER TABLE users ADD CONSTRAINT uq_users_google_id UNIQUE (google_id);
            END IF;
        END $$;
    """)
    
    # Add index only if it doesn't exist
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes WHERE indexname = 'ix_users_google_id'
            ) THEN
                CREATE INDEX ix_users_google_id ON users (google_id);
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.drop_index('ix_users_google_id', table_name='users')
    op.drop_constraint('uq_users_google_id', 'users', type_='unique')
    op.drop_column('users', 'google_id')
