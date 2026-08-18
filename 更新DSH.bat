@echo off
title DSH Updater
echo ============================================
echo    DeepSeek Harness (DSH) Updater
echo ============================================
echo.
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-dsh.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] Update failed. Check log: %~dp0dsh-update.log
    echo.
    pause
    exit /b 1
)
ping -n 4 127.0.0.1 >nul
exit /b 0
