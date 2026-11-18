@echo off
rem Thin wrapper: the real logic lives in stop.ps1 (kept ASCII, easier to maintain).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1" %*
if errorlevel 1 (
  echo.
  echo Stop failed. Press any key to close this window.
  pause >nul
)
