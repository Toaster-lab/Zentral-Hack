@echo off
rem Double-click to start BubbleCycle. Needs Python 3 (https://www.python.org/downloads/).
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 serve.py %*
  goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
  python serve.py %*
  goto :end
)
echo.
echo Python 3 was not found. Install it from https://www.python.org/downloads/
echo (tick "Add python.exe to PATH"), then double-click this file again.
echo.
:end
pause
