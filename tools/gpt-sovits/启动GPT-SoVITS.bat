@echo off
setlocal
title GPT-SoVITS 9880 (Xilian)
set "PY=D:\tools\miniconda3\envs\GPT\python.exe"
set "REPO=D:\tools\GPT-SoVITS\GPT-SoVITS-V2ProPlus-Windows-main"

netstat -ano -p tcp | findstr /C:"127.0.0.1:9880" | findstr /I "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [OK] GPT-SoVITS is already listening on 127.0.0.1:9880.
  echo      Nothing to do.
  ping -n 4 127.0.0.1 >nul
  exit /b 0
)

if not exist "%PY%" (
  echo [ERR] python not found: %PY%
  pause
  exit /b 1
)
if not exist "%REPO%\api_v2.py" (
  echo [ERR] api_v2.py not found in %REPO%
  pause
  exit /b 1
)

echo Starting GPT-SoVITS on 127.0.0.1:9880 ...
cd /d "%REPO%"
start "GPT-SoVITS 9880" /min "%PY%" api_v2.py -a 127.0.0.1 -p 9880

echo Waiting for the port (model load takes ~30-60s) ...
set /a tries=0
:wait
ping -n 4 127.0.0.1 >nul
set /a tries+=1
netstat -ano -p tcp | findstr /C:"127.0.0.1:9880" | findstr /I "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [OK] GPT-SoVITS is ready on http://127.0.0.1:9880
  ping -n 4 127.0.0.1 >nul
  exit /b 0
)
if %tries% LSS 40 goto wait

echo [WARN] port 9880 did not come up within ~120s. Check the GPT-SoVITS window for errors.
pause
exit /b 1
