# Stop whatever listens on 127.0.0.1:<port> (GPT-SoVITS by default).
# ASCII only (see start.ps1 for why).
param(
    [int]$Port = 9880,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Say {
    param([string]$Message)
    if (-not $Quiet) { Write-Host $Message }
}

$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
    Say "[OK] nothing is listening on 127.0.0.1:$Port"
    exit 0
}

foreach ($conn in $conns) {
    $pid_ = $conn.OwningProcess
    $proc = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    # Refuse to kill anything that is not python*, mirroring the plugin's safety check.
    if ($proc.ProcessName -notlike "python*") {
        Say "[WARN] port $Port is held by '$($proc.ProcessName)' (pid $pid_) - not python, refusing to kill"
        exit 1
    }
    Say "Killing pid $pid_ ($($proc.ProcessName)) ..."
    Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    Say "[WARN] port $Port is still listening"
    exit 1
}
Say "[OK] port $Port is closed"
exit 0
