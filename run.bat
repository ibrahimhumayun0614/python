@echo off
cd /d "%~dp0public"
echo.
echo Serving browser app at http://127.0.0.1:8080
echo Press Ctrl+C to stop.
echo.

set "PY=C:\Users\mohamed.ibrahim\AppData\Local\Programs\Python\Python314\python.exe"
if exist "%PY%" (
  "%PY%" -m http.server 8080
) else (
  where python >nul 2>&1
  if errorlevel 1 (
    echo Python not found. Open public\index.html in your browser instead.
    start "" "%~dp0public\index.html"
    pause
    exit /b 1
  )
  python -m http.server 8080
)
