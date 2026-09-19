@echo off
rem ============================================================
rem  health-check.cmd - DSH health check launcher (double-click)
rem  Locates pwsh 7, then runs health-check.ps1 which resolves
rem  the real python interpreter (a bare `python` often resolves
rem  to the Microsoft Store stub). Args are forwarded verbatim.
rem  Exit code: 0 all green, 1 anomaly, 2 launcher error.
rem ============================================================
setlocal
set "PWSH="
rem Locator chain (DEPLOY.md): explicit env override -> PATH -> standard roots.
rem 2026-09-19 deploy audit M3: the 4th tier used to hardcode one machine's pwsh
rem path; on a new machine that path never exists and the tier was skipped
rem silently. The "pwsh installed elsewhere" case is now covered by DSH_PWSH_PATH.
rem NOTE: keep this file pure ASCII - cmd.exe decodes .cmd/.bat as the OEM codepage,
rem so non-ASCII comments become garbage and are executed as commands.
if defined DSH_PWSH_PATH if exist "%DSH_PWSH_PATH%" set "PWSH=%DSH_PWSH_PATH%"
if not defined PWSH for /f "delims=" %%i in ('where pwsh 2^>nul') do if not defined PWSH set "PWSH=%%i"
if not defined PWSH if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined PWSH if exist "%LocalAppData%\Microsoft\WindowsApps\pwsh.exe" set "PWSH=%LocalAppData%\Microsoft\WindowsApps\pwsh.exe"
if not defined PWSH (
  echo [health-check] PowerShell 7 not found. Install it or set DSH_PWSH_PATH, then retry.
  exit /b 2
)
"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0health-check.ps1" %*
exit /b %ERRORLEVEL%