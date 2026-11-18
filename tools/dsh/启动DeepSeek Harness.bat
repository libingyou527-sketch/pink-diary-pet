@echo off
rem Start DeepSeek Harness after pruning stale dsh-auth-* cookies.
rem
rem Why: every launch of the desktop app leaves a new dsh-auth-<random> cookie for
rem 127.0.0.1 and never removes the old ones. Chromium ignores ports, so after many
rem restarts the request carries dozens of unknown auth cookies and the app dies
rem with "desktop welcome: Web authentication failed".
rem
rem This wrapper cleans them first, then starts the app. If DSH is already running
rem the cookie DB is locked and the script simply reports that and starts anyway.
setlocal
set "PY=D:\tools\miniconda3\envs\GPT\python.exe"
set "APP=D:\tools\deepseek harness\DeepSeek Harness.exe"

if exist "%PY%" (
  "%PY%" "%~dp0clean-auth-cookies.py" --quiet
) else (
  echo [WARN] python not found, skipping cookie cleanup: %PY%
)

if not exist "%APP%" (
  echo [ERR] app not found: %APP%
  pause
  exit /b 1
)

start "" "%APP%"
exit /b 0
