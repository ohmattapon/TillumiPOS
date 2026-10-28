# Saves the whole database to backups\easypos-<date>-<time>.sql.gz. Safe to run while the shop is open.
#   .\scripts\backup.ps1 [-Directory backups]
param([string]$Directory = 'backups')

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

. (Join-Path $PSScriptRoot 'podman-windows.ps1')
Initialize-Podman

New-Item -ItemType Directory -Force -Path $Directory | Out-Null
$name = 'easypos-{0}.sql.gz' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
$file = Join-Path $Directory $name
$full = Join-Path (Get-Location) $file

# The dump is compressed inside the container and copied out as a file, so no binary passes through
# the PowerShell pipeline (which would damage it).
compose -f docker-compose.yml exec -T db sh -c 'pg_dump -U pos -d pos --clean --if-exists --no-owner | gzip > /tmp/backup.sql.gz'
if ($LASTEXITCODE -ne 0) { Write-Error 'The backup failed: is the database running? (podman compose ps)' }
# sh has no pipefail, so a pg_dump that failed halfway still gives exit code 0 here. pg_dump ends every complete
# dump with a closing line; a dump cut off by a failure (a full disk, a dropped connection) is a valid gzip file
# that would wipe the shop's data when restored, so it is not kept as a backup.
compose -f docker-compose.yml exec -T db sh -c 'gunzip -c /tmp/backup.sql.gz | tail -n 20 | grep -q PostgreSQL.database.dump.complete'
if ($LASTEXITCODE -ne 0) {
  compose -f docker-compose.yml exec -T db rm -f /tmp/backup.sql.gz
  Write-Error 'The backup failed: the dump is incomplete (is the disk full?).'
}
compose -f docker-compose.yml cp db:/tmp/backup.sql.gz $full
compose -f docker-compose.yml exec -T db rm -f /tmp/backup.sql.gz

if (-not (Test-Path $full) -or (Get-Item $full).Length -lt 200) {
  Remove-Item $full -ErrorAction SilentlyContinue
  Write-Error 'The backup failed: is the database running? (podman compose ps)'
}
Write-Host "Backup saved: $file"

# Product images kept on this machine live in the app's volume; they go in a second file with the same name.
$mediaName = $name -replace '\.sql\.gz$', '.media.tar.gz'
$mediaFile = Join-Path $Directory $mediaName
$mediaFull = Join-Path (Get-Location) $mediaFile
compose -f docker-compose.yml exec -T app sh -c 'find /data/media -type f 2>/dev/null | head -n 1 | grep -q . && tar -czf /tmp/media.tar.gz -C /data/media .'
if ($LASTEXITCODE -eq 0) {
  compose -f docker-compose.yml cp app:/tmp/media.tar.gz $mediaFull
  compose -f docker-compose.yml exec -T app rm -f /tmp/media.tar.gz
  Write-Host "Images saved: $mediaFile"
}
Write-Host 'Keep a copy somewhere else too (another disk, or a cloud drive).'
