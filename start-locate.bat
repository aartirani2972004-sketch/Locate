@echo off
cd /d "%~dp0"
start "" http://127.0.0.1:5000
if exist "C:\Users\aarti\AppData\Local\Python\pythoncore-3.14-64\python.exe" (
  "C:\Users\aarti\AppData\Local\Python\pythoncore-3.14-64\python.exe" app.py
) else (
  py app.py
)
pause
