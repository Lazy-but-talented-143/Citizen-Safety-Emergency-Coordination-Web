@echo off
setlocal
cd /d "%~dp0"
echo ==============================================
echo Citizen Safety - Full Demo Launcher
echo ==============================================
call SETUP_DEMO_WINDOWS.bat
if errorlevel 1 exit /b 1
start "Citizen Safety Backend" cmd /k "cd /d %~dp0 && python manage.py runserver 127.0.0.1:8000"
start "Citizen Safety Escalation Worker" cmd /k "cd /d %~dp0 && python manage.py process_escalations"
start "Citizen Safety Frontend" cmd /k "cd /d %~dp0frontend && if not exist node_modules npm install && npm run dev"
echo.
echo Backend, automatic escalation worker, and frontend launch commands were started in separate windows.
echo Open http://localhost:5173
pause
