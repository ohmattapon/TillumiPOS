# Loads a backup made by scripts\backup.ps1. It REPLACES everything in the database.
#   .\scripts\restore.ps1 backups\easypos-20261014-210000.sql.gz [-Yes]
param([Parameter(Mandatory = $true)][string]$File, [switch]$Yes)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

. (Join-Path $PSScriptRoot 'podman-windows.ps1')
Initialize-Podman

if (-not (Test-Path $File)) { Write-Error "File not found: $File" }

# Checked before anything is touched: a dump that was cut off would leave the database half empty.
compose -f docker-compose.yml cp $File db:/tmp/restore.sql.gz
compose -f docker-compose.yml exec -T db sh -c 'gunzip -c /tmp/restore.sql.gz | tail -n 20 | grep -q PostgreSQL.database.dump.complete'
if ($LASTEXITCODE -ne 0) {
  compose -f docker-compose.yml exec -T db rm -f /tmp/restore.sql.gz
  Write-Error "$File is not a complete backup (it is damaged or was cut off). Nothing was changed."
}

if (-not $Yes) {
  Write-Host "This replaces ALL data in the shop's database with the contents of: $File"
  if ((Read-Host 'Type YES to go on') -ne 'YES') {
    compose -f docker-compose.yml exec -T db rm -f /tmp/restore.sql.gz
    Write-Host 'Cancelled.'
    exit 1
  }
}

compose -f docker-compose.yml stop app
# One transaction: if anything in the file fails, the database is left exactly as it was.
compose -f docker-compose.yml exec -T db sh -c 'gunzip -c /tmp/restore.sql.gz | psql -U pos -d pos -v ON_ERROR_STOP=1 --single-transaction --quiet && rm /tmp/restore.sql.gz'
if ($LASTEXITCODE -ne 0) {
  compose -f docker-compose.yml start app
  Write-Error 'The restore failed, and the database was left as it was. The app has been started again.'
}
compose -f docker-compose.yml start app
$mediaFile = $File -replace '\.sql\.gz$', '.media.tar.gz'
if (Test-Path $mediaFile) {
  Write-Host 'Restoring the images...'
  compose -f docker-compose.yml cp $mediaFile app:/tmp/media.tar.gz
  compose -f docker-compose.yml exec -T app sh -c 'rm -rf /data/media/* && tar -xzf /tmp/media.tar.gz -C /data/media && rm /tmp/media.tar.gz'
}
Write-Host "Restored from $File"
