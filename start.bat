@echo off
cd /d "%~dp0"
set DB_PATH=%~dp0greenfun.db
echo 正在启动绿趣全流程管理系统...
python app.py || py app.py || "C:\Users\12961\.workbuddy\binaries\python\versions\3.13.12\python.exe" app.py
pause
