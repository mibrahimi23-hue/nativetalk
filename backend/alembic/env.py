"""
Alembic environment configuration.

This file is run by Alembic for both online and offline migrations.

Usage:
    alembic upgrade head      # apply all pending migrations
    alembic revision --autogenerate -m "description"   # generate new migration
    alembic downgrade -1      # roll back one migration
"""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine, pool

# ── Make app importable ───────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import get_settings
from app.db.base import Base  # imports all models — required for autogenerate

settings = get_settings()

# ── Alembic Config ────────────────────────────────────────────────────────────
config = context.config

DATABASE_URL = settings.DATABASE_URL.replace(
    "postgresql://", "postgresql+psycopg2://"
)

config.set_main_option("sqlalchemy.url", DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (generates SQL script)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url                     = url,
        target_metadata         = target_metadata,
        literal_binds           = True,
        dialect_opts            = {"paramstyle": "named"},
        compare_type            = True,
        compare_server_default  = True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database connection."""
    connectable = create_engine(
        DATABASE_URL,
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection              = connection,
            target_metadata         = target_metadata,
            compare_type            = True,
            compare_server_default  = True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
    