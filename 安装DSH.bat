@echo off
title DSH Setup (new PC)
echo ==============================================
echo   DSH one-time setup for a new computer
echo   (requires: Node.js + pnpm + git installed)
echo ==============================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
if errorlevel 1 (
    echo.
    echo [FAILED] Setup did not finish. Read the messages above.
    pause
) else (
    echo.
    echo [OK] Setup finished.
    echo Launch DSH later via: DSH-ops\start bat or desktop shortcut.
    ping -n 6 127.0.0.1 >nul
)
