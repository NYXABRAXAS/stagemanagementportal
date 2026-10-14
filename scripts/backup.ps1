<#
.SYNOPSIS
  Backs up the portal database with pg_dump (custom format) into .\backups and keeps the newest N files.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 -OutDir D:\Backups\los-portal -Keep 60
#>
param(
  [string]$EnvFile = "$PSScriptRoot\..\server\.env",
  [string]$OutDir = "$PSScriptRoot\..\backups",
  [int]$Keep = 30
)
$ErrorActionPreference = 'Stop'

$line = Get-Content $EnvFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $line) { throw "DATABASE_URL not found in $EnvFile" }
$url = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim('"', "'", ' ')
$dbUrl = ($url -split '\?')[0]                       # pg_dump does not understand ?schema=public
$dbName = ($dbUrl -split '/')[-1]

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
$file = Join-Path $OutDir "${dbName}_$stamp.dump"

& pg_dump --format=custom --no-owner --file "$file" "$dbUrl"
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
Write-Host "Backup written: $file ($([math]::Round((Get-Item $file).Length / 1KB)) KB)"

Get-ChildItem $OutDir -Filter "${dbName}_*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | ForEach-Object {
  Remove-Item $_.FullName -Force
  Write-Host "Removed old backup $($_.Name)"
}
