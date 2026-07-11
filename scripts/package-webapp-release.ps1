param(
  [string]$OutputRoot = 'release',
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $root $OutputRoot
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$packageName = "nava-ai-assistant-webapp-$stamp"
$packageRoot = Join-Path $outputDirectory $packageName
$zipPath = Join-Path $outputDirectory "$packageName.zip"
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (-not $npmCommand) {
  $npmCommand = Get-Command npm -ErrorAction Stop
}

Set-Location $root

if (-not $SkipBuild) {
  & $npmCommand.Source run build:all
}

$frontendDist = Join-Path $root 'dist\nava-ai-assistant'
$serverDist = Join-Path $root 'server\dist'

if (-not (Test-Path -LiteralPath (Join-Path $frontendDist 'index.html'))) {
  throw 'Angular build output was not found. Run npm run build:webapp first.'
}

if (-not (Test-Path -LiteralPath (Join-Path $serverDist 'main.js'))) {
  throw 'Server build output was not found. Run npm run build:webapp first.'
}

New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot 'dist') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot 'server') | Out-Null

Copy-Item -LiteralPath $frontendDist -Destination (Join-Path $packageRoot 'dist\nava-ai-assistant') -Recurse
Copy-Item -LiteralPath $serverDist -Destination (Join-Path $packageRoot 'server\dist') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'server\package.json') -Destination (Join-Path $packageRoot 'server\package.json')
Copy-Item -LiteralPath (Join-Path $root 'server\package-lock.json') -Destination (Join-Path $packageRoot 'server\package-lock.json')
Copy-Item -LiteralPath (Join-Path $root 'deploy\.env.example') -Destination (Join-Path $packageRoot '.env.example')
Copy-Item -LiteralPath (Join-Path $root 'deploy\install-dependencies.ps1') -Destination (Join-Path $packageRoot 'install-dependencies.ps1')
Copy-Item -LiteralPath (Join-Path $root 'deploy\start-webapp.ps1') -Destination (Join-Path $packageRoot 'start-webapp.ps1')
Copy-Item -LiteralPath (Join-Path $root 'deploy\README.md') -Destination (Join-Path $packageRoot 'README.md')

Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $zipPath -Force

Write-Host "Deployment folder: $packageRoot"
Write-Host "Deployment zip: $zipPath"
