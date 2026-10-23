@echo off
setlocal
cd /d "%~dp0"
echo ==============================================
echo Citizen Safety - Local Demo Setup
echo ==============================================
python -m pip install -r requirements.txt
if errorlevel 1 goto :error
python manage.py migrate
if errorlevel 1 goto :error
python repair_demo_db.py
if errorlevel 1 goto :error
python manage.py seed_demo
if errorlevel 1 goto :error
echo.
echo Backend setup complete.
echo Open a second terminal in frontend and run: npm install && npm run dev
pause
exit /b 0
:error
echo Setup failed. Check the error above.
pause
exit /b 1
