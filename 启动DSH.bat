@echo off
title DSH Launcher
rem 2026-09-19 deploy audit M4: this used to call a bare "pwsh.exe", which relies on
rem PATH - while DEPLOY.md promises DSH_PWSH_PATH covers non-default installs, that
rem variable is only read by Resolve-PwshPath inside the .ps1 files, never by a
rem double-clicked .bat. Same locator chain added here: env -> PATH -> standard roots.
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
echo    DeepSeek Harness (DSH) One-Click Launcher
echo ============================================
echo.
echo [1/2] Checking for updates...
"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-update.ps1"
echo.
echo [2/2] Restarting DSH service (stop current, then start)...
"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dsh-web.ps1" -Restart
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
