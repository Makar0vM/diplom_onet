@echo off
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
    echo Creating venv...
    python -m venv venv
    call venv\Scripts\activate.bat
    python -m pip install --upgrade pip
    pip install -r app\requirements.txt
    echo Training ML model if missing...
    python -m app.ml.train
) else (
    call venv\Scripts\activate.bat
)
echo Starting API at http://127.0.0.1:8000
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
