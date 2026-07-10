$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$frontendIndex = Join-Path $root 'dist\nava-ai-assistant\index.html'
$backendEntry = Join-Path $root 'server\dist\main.js'
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (-not $npmCommand) {
  $npmCommand = Get-Command npm -ErrorAction Stop
}

if (-not (Test-Path -LiteralPath $frontendIndex) -or -not (Test-Path -LiteralPath $backendEntry)) {
  Write-Host 'Build output not found. Running npm run build:all...'
  & $npmCommand.Source run build:all
}

if (-not $env:HOST) {
  $env:HOST = '127.0.0.1'
}

if (-not $env:PORT) {
  $env:PORT = '3000'
}

$url = "http://$($env:HOST):$($env:PORT)"

Write-Host "Nava web app will run at $url"
Write-Host 'Press Ctrl+C to stop the server.'

& $npmCommand.Source run start:webapp
