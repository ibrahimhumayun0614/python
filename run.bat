@echo off
cd /d "%~dp0"

set "PY=C:\Users\mohamed.ibrahim\AppData\Local\Programs\Python\Python314\python.exe"
if not exist "%PY%" (
  where python >nul 2>&1
  if errorlevel 1 (
    echo Python was not found.
    pause
    exit /b 1
  )
  set "PY=python"
)

if not exist .venv (
  "%PY%" -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install -r requirements.txt
echo.
echo Starting server at http://127.0.0.1:8000
echo.
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
