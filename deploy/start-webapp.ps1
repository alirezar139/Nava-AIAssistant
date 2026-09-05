$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverEntry = Join-Path $root 'server\dist\main.js'

if (-not (Test-Path -LiteralPath $serverEntry)) {
  throw 'server/dist/main.js was not found. Build and package the app again.'
}

if (-not (Test-Path -LiteralPath (Join-Path $root '.env'))) {
  throw '.env was not found next to this script. Copy .env.example to .env and configure it first.'
}

# main.js loads .env itself (via dotenv/config) from the current directory,
# so run from the package root where .env actually lives.
Set-Location $root

Write-Host 'نوا is starting. Check .env for HOST/PORT.'
Write-Host 'Press Ctrl+C to stop the server.'

& node $serverEntry
