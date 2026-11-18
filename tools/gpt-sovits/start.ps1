# GPT-SoVITS launcher (windowless).
# ASCII only on purpose: cmd / Windows PowerShell reads .ps1 without BOM as ANSI,
# so CJK text here would turn into mojibake.
#
# Behaviour:
#   - if 127.0.0.1:<port> is already listening -> exit 0 (idempotent)
#   - otherwise start api_v2.py hidden (MainWindowHandle = 0, no console window)
#   - poll until the port opens, at most ~120s, then report
param(
    [int]$Port = 9880,
    [int]$TimeoutSeconds = 120,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$Python  = "D:\tools\miniconda3\envs\GPT\python.exe"
$Repo    = "D:\tools\GPT-SoVITS\GPT-SoVITS-V2ProPlus-Windows-main"
$LogBase = Join-Path $Repo "api-server.log"

function Test-Port {
    param([int]$P)
    try {
        return [bool](Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue)
    } catch {
        return $false
    }
}

function Say {
    param([string]$Message)
    if (-not $Quiet) { Write-Host $Message }
}

if (Test-Port $Port) {
    Say "[OK] GPT-SoVITS is already listening on 127.0.0.1:$Port - nothing to do."
    exit 0
}

if (-not (Test-Path $Python)) {
    Say "[ERR] python not found: $Python"
    exit 1
}
if (-not (Test-Path (Join-Path $Repo "api_v2.py"))) {
    Say "[ERR] api_v2.py not found in $Repo"
    exit 1
}

# api_v2.py prints the target text; Windows stdout defaults to GBK and any ♪ (U+266A)
# in the text raises UnicodeEncodeError -> HTTP 400/500. Force UTF-8.
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
$env:PYTHONLEGACYWINDOWSSTDIO = "0"
Say "Starting GPT-SoVITS windowless on 127.0.0.1:$Port ..."
$p = Start-Process -FilePath $Python `
    -ArgumentList @("api_v2.py", "-a", "127.0.0.1", "-p", "$Port") `
    -WorkingDirectory $Repo `
    -WindowStyle Hidden `
    -RedirectStandardOutput "$LogBase.out" `
    -RedirectStandardError "$LogBase.err" `
    -PassThru
Say "  pid=$($p.Id)  (logs: $LogBase.out / .err)"

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    if (Test-Port $Port) {
        $proc = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
        $mem = if ($proc) { [math]::Round($proc.WorkingSet64 / 1MB) } else { 0 }
        Say "[OK] ready on http://127.0.0.1:$Port  (pid=$($p.Id), working set ${mem}MB, window handle=$($proc.MainWindowHandle))"
        exit 0
    }
    if ($p.HasExited) {
        Say "[ERR] the process exited early (code $($p.ExitCode)). Check $LogBase.err"
        exit 1
    }
}

Say "[WARN] port $Port did not open within ${TimeoutSeconds}s. The process may still be loading; check $LogBase.err"
exit 1
