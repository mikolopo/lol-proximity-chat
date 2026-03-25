@echo off
echo ===================================================
echo   LoL Proximity Chat — Voice Relay Server (Windows)
echo ===================================================
echo.

cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Download it from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Install dependencies if not present
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    echo.
)

:: Start server
echo Starting server on port 8080...
echo Press Ctrl+C to stop.
echo.
node voice_server.js
pause
