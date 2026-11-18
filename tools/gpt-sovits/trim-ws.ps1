# Trim the working set of a process: push its pages out to the pagefile without
# killing it. Measured effect on GPT-SoVITS after a synthesis: ~3.8GB -> ~4MB
# working set, at the cost of ~0.7s page-in on the next request.
# ASCII only: Windows PowerShell reads BOM-less .ps1 as ANSI.
param(
    [Parameter(Mandatory = $true)][int]$TargetPid
)

$ErrorActionPreference = "Stop"

$src = @'
using System;
using System.Runtime.InteropServices;
public static class XilianWs {
    [DllImport("psapi.dll", SetLastError = true)]
    public static extern bool EmptyWorkingSet(IntPtr hProcess);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr h);
}
'@

if (-not ("XilianWs" -as [type])) {
    Add-Type -TypeDefinition $src
}

$handle = [XilianWs]::OpenProcess(0x1F0FFF, $false, $TargetPid)
if ($handle -eq [IntPtr]::Zero) {
    Write-Error "cannot open pid $TargetPid"
    exit 2
}

try {
    $ok = [XilianWs]::EmptyWorkingSet($handle)
} finally {
    [XilianWs]::CloseHandle($handle) | Out-Null
}

if ($ok) {
    exit 0
} else {
    Write-Error "EmptyWorkingSet failed for pid $TargetPid"
    exit 3
}
