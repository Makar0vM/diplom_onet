import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api.routes import router
from app.core.security import hash_password
from app.db import models  # noqa: F401
from app.db.database import Base, SessionLocal, engine
from app.db.models import User


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.email == "admin@grifind-invest.ru").first():
            db.add(
                User(
                    email="admin@grifind-invest.ru",
                    password_hash=hash_password("admin123"),
                    role="admin",
                    company_name='ООО «Грифинд Инвест»',
                    inn="5609205966",
                    contact_name="Администратор",
                )
            )
            db.commit()
    finally:
        db.close()
    yield


app = FastAPI(title="Инвестиционная платформа «Грифинд Инвест»", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")

_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
_assets_dir = _frontend_dist / "assets"


def _resolve_asset(rel_path: str) -> Path | None:
    """Безопасно отдать только файлы из frontend/dist/assets."""
    if not rel_path or rel_path.startswith(("/", "\\")):
        return None
    base = _assets_dir.resolve()
    if not base.is_dir():
        return None
    candidate = (base / rel_path).resolve()
    try:
        candidate.relative_to(base)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


@app.get("/assets/{resource_path:path}")
async def serve_frontend_assets(resource_path: str):
    path = _resolve_asset(resource_path)
    if path is None:
        raise HTTPException(status_code=404, detail="Not found")
    media_type, _ = mimetypes.guess_type(str(path))
    if path.suffix.lower() == ".js":
        media_type = "application/javascript"
    elif path.suffix.lower() == ".css":
        media_type = "text/css"
    return FileResponse(path, media_type=media_type or "application/octet-stream")


@app.get("/")
async def spa_index():
    index = _frontend_dist / "index.html"
    if index.is_file():
        return FileResponse(index)
    return {
        "message": "Соберите React: cd frontend && npm install && npm run build",
        "api": "/api/v1",
        "docs": "/docs",
    }
