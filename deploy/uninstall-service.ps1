# Stops and removes the NavaAiAssistantApi Windows Service installed by
# install-service.ps1. Run from an elevated (Administrator) PowerShell prompt.

$ErrorActionPreference = 'Stop'

$serviceName = 'NavaAiAssistantApi'
$nssm = Get-Command nssm.exe -ErrorAction SilentlyContinue
if (-not $nssm) {
  throw 'nssm.exe was not found on PATH. Install NSSM (https://nssm.cc/download) first.'
}

& $nssm.Source stop $serviceName
& $nssm.Source remove $serviceName confirm

Write-Host "Service '$serviceName' removed."
