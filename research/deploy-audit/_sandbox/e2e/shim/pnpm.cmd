@echo off
echo [pnpm-shim] intercepted: %* >> "%~dp0..\pnpm-shim.log"
exit /b 0
