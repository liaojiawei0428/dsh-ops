@echo off
title DSH Launcher
echo ============================================
echo    DeepSeek Harness (DSH) One-Click Launcher
echo ============================================
echo.
echo [1/2] Checking for updates...
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-update.ps1"
echo.
echo [2/2] Starting DSH service...
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dsh-web.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] DSH server failed to start.
    echo Check log: %~dp0dsh-web.err.log
    echo.
    pause
    exit /b 1
)
echo.
echo Done. The page will open in your browser.
ping -n 4 127.0.0.1 >nul
exit /b 0
