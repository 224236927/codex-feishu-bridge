$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot 'runtime\bridge.pid'
$projectPattern = 'scripts/run-bridge\.js'

$matching = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -match $projectPattern
}

if ($matching) {
  $matching | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
    Write-Output "Stopped bridge process $($_.ProcessId)."
  }
}

if (-not (Test-Path $pidFile)) {
  if (-not $matching) {
    Write-Output 'No bridge.pid file found.'
  }
  exit 0
}

$bridgePid = Get-Content $pidFile | Select-Object -First 1
if (-not $bridgePid) {
  Write-Output 'bridge.pid is empty.'
  Remove-Item $pidFile -ErrorAction SilentlyContinue
  exit 0
}

if (-not $matching) {
  $process = Get-Process -Id $bridgePid -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $bridgePid -Force
    Write-Output "Stopped bridge process $bridgePid."
  } else {
    Write-Output "Process $bridgePid is not running."
  }
}

Remove-Item $pidFile -ErrorAction SilentlyContinue
