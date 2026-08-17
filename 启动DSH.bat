@echo off
title DSH Launcher
echo ============================================
echo    DeepSeek Harness (DSH) One-Click Launcher
echo ============================================
echo.
echo [1/2] Checking for updates...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\GongJu\DSH-ops\check-update.ps1"
echo.
echo [2/2] Starting DSH service...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\GongJu\DSH-ops\start-dsh-web.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] DSH server failed to start.
    echo Check log: D:\GongJu\DSH-ops\dsh-web.err.log
    echo.
    pause
    exit /b 1
)
echo.
echo Done. The page will open in your browser.
ping -n 4 127.0.0.1 >nul
exit /b 0
