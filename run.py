"""Запуск API (после сборки React раздаётся с http://127.0.0.1:8000/).

Разработка: терминал 1 — python run.py ; терминал 2 — cd frontend && npm run dev
(прокси /api на порт 8000, CORS уже включён в app.main).
"""

import os

import uvicorn

if __name__ == "__main__":
    reload = os.getenv("UVICORN_RELOAD", "1").lower() in ("1", "true", "yes")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=reload)
