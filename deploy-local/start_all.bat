@echo off
cd /d "%~dp0"
echo Starting GreenFun local server + external tunnel (one-click)...
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start_all.ps1"
echo.
pause
