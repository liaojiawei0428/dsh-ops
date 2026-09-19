@echo off
title DSH Updater
rem 2026-09-19 deploy audit M4: this used to call a bare "pwsh.exe" (PATH-dependent,
rem and DSH_PWSH_PATH has no effect on it). Same locator chain added here.
rem NOTE: keep this file pure ASCII - cmd.exe decodes .bat as the OEM codepage, so
rem non-ASCII comments become garbage and are executed as commands.
setlocal
set "PWSH="
if defined DSH_PWSH_PATH if exist "%DSH_PWSH_PATH%" set "PWSH=%DSH_PWSH_PATH%"
if not defined PWSH for /f "delims=" %%i in ('where pwsh 2^>nul') do if not defined PWSH set "PWSH=%%i"
if not defined PWSH if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined PWSH if exist "%LocalAppData%\Microsoft\WindowsApps\pwsh.exe" set "PWSH=%LocalAppData%\Microsoft\WindowsApps\pwsh.exe"
if not defined PWSH (
    echo [ERROR] PowerShell 7 not found. Install it, or set DSH_PWSH_PATH to its full path, then retry.
    pause
    exit /b 1
)
echo ============================================
echo    DeepSeek Harness (DSH) Updater
echo ============================================
echo.
"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-dsh.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] Update failed. Check log: %~dp0dsh-update.log
    echo.
    pause
    exit /b 1
)
ping -n 4 127.0.0.1 >nul
exit /b 0
