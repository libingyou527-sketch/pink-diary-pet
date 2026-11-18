@echo off
setlocal
title Stop GPT-SoVITS (9880)
echo Stopping the process that listens on 127.0.0.1:9880 ...
for /f "tokens=5" %%a in ('netstat -ano -p tcp ^| findstr /C:"127.0.0.1:9880" ^| findstr /I "LISTENING"') do (
  echo   kill PID %%a
  taskkill /PID %%a /F >nul 2>&1
)
netstat -ano -p tcp | findstr /C:"127.0.0.1:9880" | findstr /I "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [WARN] port 9880 is still listening.
) else (
  echo [OK] port 9880 is closed.
)
ping -n 3 127.0.0.1 >nul
