"""
SQLAlchemy engine and session factory.

Uses a synchronous engine backed by psycopg2 (no async driver needed for this
use-case; adding asyncpg/greenlet complexity would be over-engineering here).

DATABASE_URL format: postgresql://user:password@host:port/dbname
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("NativeTalk.db")
settings = get_settings()

engine = create_engine(
    settings.DATABASE_URL,
    echo=False,           # set True locally for SQL debug output
    pool_pre_ping=True,   # verify connections before checkout
    pool_recycle=180,     # drop connections older than 3 min (Supabase /
                          # pgbouncer kills idle ones quietly, which used to
                          # surface as "server closed the connection
                          # unexpectedly" on the next query)
    pool_size=5,
    max_overflow=10,
    connect_args={
        # TCP keepalives keep the socket alive across NAT / firewall
        # idle timeouts so the kernel notices a dead peer before SQL does.
        "keepalives":          1,
        "keepalives_idle":     30,
        "keepalives_interval": 10,
        "keepalives_count":    3,
    },
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


def get_db():
    """
    FastAPI dependency that provides a DB session per request.

    Usage in an endpoint:
        from app.db.session import get_db
        def my_endpoint(db: Session = Depends(get_db)): ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
