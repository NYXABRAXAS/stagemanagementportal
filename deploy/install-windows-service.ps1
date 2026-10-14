<#
.SYNOPSIS
  Registers the portal as a Windows service using NSSM (https://nssm.cc) so it starts on boot and
  restarts on failure. Run in an elevated PowerShell after `npm ci` and `npm run build`.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\install-windows-service.ps1 -AppDir C:\apps\stagemanagementportal -Nssm C:\tools\nssm\win64\nssm.exe
#>
param(
  [string]$AppDir = (Resolve-Path "$PSScriptRoot\.."),
  [string]$Nssm = 'nssm.exe',
  [string]$ServiceName = 'LosStagePortal'
)
$ErrorActionPreference = 'Stop'
$node = (Get-Command node).Source
$serverDir = Join-Path $AppDir 'server'
$logDir = Join-Path $AppDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

& $Nssm install $ServiceName $node 'dist\server\src\index.js'
& $Nssm set $ServiceName AppDirectory $serverDir
& $Nssm set $ServiceName AppEnvironmentExtra 'NODE_ENV=production'
& $Nssm set $ServiceName DisplayName 'ProHorizon LOS Stage Management Portal'
& $Nssm set $ServiceName Start SERVICE_AUTO_START
& $Nssm set $ServiceName AppExit Default Restart
& $Nssm set $ServiceName AppRestartDelay 5000
& $Nssm set $ServiceName AppStdout (Join-Path $logDir 'portal.out.log')
& $Nssm set $ServiceName AppStderr (Join-Path $logDir 'portal.err.log')
& $Nssm set $ServiceName AppRotateFiles 1
& $Nssm set $ServiceName AppRotateBytes 10485760
& $Nssm start $ServiceName
Write-Host "Service $ServiceName installed and started. Check: http://localhost:4000/api/health"
