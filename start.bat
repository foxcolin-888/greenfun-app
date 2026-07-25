@echo off
cd /d "%~dp0"
set DB_PATH=%~dp0greenfun.db
echo 绿趣全流程管理系统启动器（崩溃自动重启，Ctrl+C 退出）
:loop
python app.py || py app.py || "C:\Users\12961\.workbuddy\binaries\python\versions\3.13.12\python.exe" app.py
echo [%time%] 服务已停止，5秒后自动重启...
timeout /t 5 /nobreak >nul
goto loop
