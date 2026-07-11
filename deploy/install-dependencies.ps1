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

& $npmCommand.Source --prefix $serverPath ci --omit=dev
