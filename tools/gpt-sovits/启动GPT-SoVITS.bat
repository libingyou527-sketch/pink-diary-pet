@echo off
rem Thin wrapper: the real logic lives in start.ps1 (kept ASCII, easier to maintain).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 (
  echo.
  echo Startup failed. Press any key to close this window.
  pause >nul
)
