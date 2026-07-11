$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverEntry = Join-Path $root 'server\dist\main.js'
$envFile = Join-Path $root '.env'

if (Test-Path -LiteralPath $envFile) {
  Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()

    if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) {
      return
    }

    $parts = $line.Split('=', 2)
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()

    if ($name) {
      [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
  }
}

if (-not $env:HOST) {
  $env:HOST = '127.0.0.1'
}

if (-not $env:PORT) {
  $env:PORT = '3000'
}

if (-not (Test-Path -LiteralPath $serverEntry)) {
  throw 'server/dist/main.js was not found. Build and package the app again.'
}

Write-Host "Nava AI Assistant is starting at http://$($env:HOST):$($env:PORT)"
Write-Host 'Press Ctrl+C to stop the server.'

& node $serverEntry
