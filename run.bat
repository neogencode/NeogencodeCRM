@echo off
title Neogencode CRM Local Launcher
echo ===================================================
echo             NEOGENCODE CRM LIGHTWEIGHT LAUNCHER
echo ===================================================
echo.
echo Checking for Python to serve with localhost (recommended for voice/notifications)...

python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Python detected! Starting server at http://localhost:8000
    start http://localhost:8000
    python -m http.server 8000
) else (
    echo.
    echo Python is not installed.
    echo Opening index.html directly as a local file...
    echo (Note: Microphone permissions might be restricted by Chrome on file:// links)
    echo.
    start index.html
)
pause
