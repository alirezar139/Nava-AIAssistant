# Registers the Node.js API process as a Windows Service using NSSM, so IIS
# (configured as a reverse proxy in front of it, see web.config) always has a
# running backend to forward /api/* requests to.
#
# Prerequisites:
#   - NSSM installed and on PATH (https://nssm.cc/download)
#   - Node.js installed on this machine
#   - This script run from an elevated (Administrator) PowerShell prompt
#   - server/.env already configured (DATABASE_URL, JWT_SECRET, etc.)
#   - Migrations already applied (see apply-migrations.ps1)
#
# Usage: powershell -ExecutionPolicy Bypass -File deploy/install-service.ps1

$ErrorActionPreference = 'Stop'

$serviceName = 'NavaAiAssistantApi'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$appEntry = Join-Path $root 'server\dist\main.js'
$logDirectory = Join-Path $root 'logs'

$nssm = Get-Command nssm.exe -ErrorAction SilentlyContinue
if (-not $nssm) {
  throw 'nssm.exe was not found on PATH. Install NSSM (https://nssm.cc/download) first.'
}

$node = Get-Command node.exe -ErrorAction Stop

if (-not (Test-Path -LiteralPath $appEntry)) {
  throw "server/dist/main.js was not found at $appEntry. Build the server before installing the service."
}

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

& $nssm.Source install $serviceName $node.Source $appEntry
& $nssm.Source set $serviceName AppDirectory $root
& $nssm.Source set $serviceName AppStdout (Join-Path $logDirectory 'service-out.log')
& $nssm.Source set $serviceName AppStderr (Join-Path $logDirectory 'service-err.log')
& $nssm.Source set $serviceName AppRotateFiles 1
& $nssm.Source set $serviceName AppRotateBytes 10485760
& $nssm.Source set $serviceName Start SERVICE_AUTO_START
& $nssm.Source set $serviceName AppRestartDelay 5000

& $nssm.Source start $serviceName

Write-Host "Service '$serviceName' installed and started."
Write-Host "Logs: $logDirectory"
