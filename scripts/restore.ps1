# Loads a backup made by scripts\backup.ps1. It REPLACES everything in the database.
#   .\scripts\restore.ps1 backups\easypos-20261014-210000.sql.gz [-Yes]
param([Parameter(Mandatory = $true)][string]$File, [switch]$Yes)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Test-Path $File)) { Write-Error "File not found: $File" }
if (-not $Yes) {
  Write-Host "This replaces ALL data in the shop's database with the contents of: $File"
  if ((Read-Host 'Type YES to go on') -ne 'YES') { Write-Host 'Cancelled.'; exit 1 }
}

docker compose -f docker-compose.yml stop app
docker compose -f docker-compose.yml cp $File db:/tmp/restore.sql.gz
docker compose -f docker-compose.yml exec -T db sh -c 'gunzip -c /tmp/restore.sql.gz | psql -U pos -d pos -v ON_ERROR_STOP=1 --quiet && rm /tmp/restore.sql.gz'
if ($LASTEXITCODE -ne 0) {
  Write-Error 'The restore failed. The app is stopped: fix the cause, then start it with: docker compose start app'
}
docker compose -f docker-compose.yml start app
Write-Host "Restored from $File"
