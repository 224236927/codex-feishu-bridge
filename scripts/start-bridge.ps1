$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot 'runtime'
$pidFile = Join-Path $runtimeDir 'bridge.pid'
$stdout = Join-Path $runtimeDir 'bridge.out.log'
$stderr = Join-Path $runtimeDir 'bridge.err.log'
$projectPattern = 'scripts/run-bridge\.js'
$nodePath = (Get-Command node).Source

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$existing = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -match $projectPattern
}

if ($existing) {
  $existing | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Seconds 1
}

Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue

$process = Start-Process `
  -FilePath $nodePath `
  -ArgumentList 'scripts/run-bridge.js' `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru

Set-Content -Path $pidFile -Value $process.Id
Start-Sleep -Seconds 5

Write-Output "Started bridge with PID $($process.Id)."
if (Test-Path $stdout) {
  Get-Content -Raw $stdout
}
