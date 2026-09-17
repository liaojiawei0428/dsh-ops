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
for /f "delims=" %%i in ('where pwsh 2^>nul') do if not defined PWSH set "PWSH=%%i"
rem fallback: standard install roots, then this machine's custom root
if not defined PWSH if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined PWSH if exist "%LocalAppData%\Microsoft\WindowsApps\pwsh.exe" set "PWSH=%LocalAppData%\Microsoft\WindowsApps\pwsh.exe"
if not defined PWSH if exist "E:\GongJu\7\pwsh.exe" set "PWSH=E:\GongJu\7\pwsh.exe"
if not defined PWSH (
  echo [health-check] PowerShell 7 not found. Install it, then retry.
  exit /b 2
)
"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0health-check.ps1" %*
exit /b %ERRORLEVEL%