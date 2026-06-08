from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings


def _ensure_sqlite_parent(url: str) -> None:
    if not url.startswith("sqlite"):
        return
    raw = url.removeprefix("sqlite:///")
    if raw.startswith("/"):
        db_path = Path(raw)
    else:
        db_path = Path(raw)
    parent = db_path.parent
    if parent and str(parent) not in (".", ""):
        parent.mkdir(parents=True, exist_ok=True)


def _connect_args(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


DATABASE_URL = settings.database_url_normalized
_ensure_sqlite_parent(DATABASE_URL)

engine = create_engine(DATABASE_URL, connect_args=_connect_args(DATABASE_URL))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
