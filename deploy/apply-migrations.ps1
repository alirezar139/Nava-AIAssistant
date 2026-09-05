$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $root 'server'
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (-not $npmCommand) {
  $npmCommand = Get-Command npm -ErrorAction Stop
}

if (-not (Test-Path -LiteralPath (Join-Path $serverPath 'package.json'))) {
  throw 'server/package.json was not found. Run this script from the extracted deployment package.'
}

if (-not (Test-Path -LiteralPath (Join-Path $serverPath '.env'))) {
  throw 'server/.env was not found. Copy .env.example to server/.env and set DATABASE_URL before applying migrations.'
}

Write-Host 'Applying Prisma migrations against DATABASE_URL from server/.env ...'
& $npmCommand.Source --prefix $serverPath run prisma:migrate:deploy
Write-Host 'Migrations applied.'
