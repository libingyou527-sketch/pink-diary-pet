@echo off
rem Clean the piled-up dsh-auth-* cookies that make the desktop app fail with
rem "Web authentication failed". Close DeepSeek Harness completely first.
setlocal
set "PY=D:\tools\miniconda3\envs\GPT\python.exe"
if not exist "%PY%" (
  echo [ERR] python not found: %PY%
  pause
  exit /b 1
)
"%PY%" "%~dp0clean-auth-cookies.py" %*
echo.
echo Done. You can start DeepSeek Harness again.
pause >nul
