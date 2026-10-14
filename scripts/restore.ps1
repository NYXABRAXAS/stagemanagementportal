<#
.SYNOPSIS
  Restores a pg_dump custom-format backup into the portal database (replaces existing objects).
  Stop the portal (service or npm start) before restoring.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 -File backups\los_stage_portal_20261015_0200.dump
#>
param(
  [Parameter(Mandatory = $true)][string]$File,
  [string]$EnvFile = "$PSScriptRoot\..\server\.env",
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $File)) { throw "Backup file not found: $File" }

$line = Get-Content $EnvFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $line) { throw "DATABASE_URL not found in $EnvFile" }
$url = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim('"', "'", ' ')
$dbUrl = ($url -split '\?')[0]

if (-not $Force) {
  $answer = Read-Host "This will REPLACE the data in $(($dbUrl -split '@')[-1]) with $File. Type YES to continue"
  if ($answer -ne 'YES') { Write-Host 'Cancelled.'; exit 1 }
}

& pg_restore --clean --if-exists --no-owner --single-transaction --dbname "$dbUrl" "$File"
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }
Write-Host 'Restore complete. Start the portal again and check /api/health.'
