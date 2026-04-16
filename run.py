"""Запуск API (после сборки React раздаётся с http://127.0.0.1:8000/).

Разработка: терминал 1 — python run.py ; терминал 2 — cd frontend && npm run dev
(прокси /api на порт 8000, CORS уже включён в app.main).
"""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
