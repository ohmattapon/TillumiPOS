# Saves the whole database to <backups>\easypos-<date>-<time>.sql.gz, plus the product
# images in a .media.tar.gz file with the same name (only when images exist).
# Native twin of scripts/backup.ps1: it talks to the embedded postgres directly
# instead of going through a container. Safe to run while the shop is open.
#
#   .\installer\scripts\backup-native.ps1 -PgsqlBinDir '<InstallDir>\pgsql\bin' -DataDir '<DataDir>'
#
# All paths come from parameters (no hardcoded machine paths). The database password is read
# from DATABASE_URL in <DataDir>.env (shop-database.ps1) and handed to pg_dump as PGPASSWORD.
param(
  [Parameter(Mandatory = $true)][string]$PgsqlBinDir,
  [Parameter(Mandatory = $true)][string]$DataDir,
  [int]$PortDb = 5435,
  [string]$DbUser = 'pos',
  [string]$Database = 'pos',
  [string]$Directory = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'shop-database.ps1')

function Test-DumpComplete([string]$GzPath) {
  # pg_dump ends every complete dump with a closing line. A dump cut off by a failure
  # (a full disk, a dropped connection) still decompresses fine, and restoring it would
  # wipe the shop's data — so an incomplete dump is never kept. Reading to the end also
  # proves the gzip itself is intact (a damaged file throws while reading).
  $stream = [IO.File]::OpenRead($GzPath)
  try {
    $gzip = New-Object IO.Compression.GzipStream($stream, [IO.Compression.CompressionMode]::Decompress)
    $reader = New-Object IO.StreamReader($gzip)
    $tail = New-Object Collections.Generic.Queue[string]
    while (($line = $reader.ReadLine()) -ne $null) {
      $tail.Enqueue($line)
      if ($tail.Count -gt 20) { [void]$tail.Dequeue() }
    }
    $reader.Close()
    return (($tail -join "`n") -match 'PostgreSQL database dump complete')
  } finally { $stream.Close() }
}

function Compress-GzipFile([string]$SourcePath, [string]$TargetPath) {
  $source = [IO.File]::OpenRead($SourcePath)
  try {
    $target = [IO.File]::Create($TargetPath)
    try {
      $gzip = New-Object IO.Compression.GzipStream($target, [IO.Compression.CompressionMode]::Compress)
      $source.CopyTo($gzip)
      $gzip.Close()
    } finally { $target.Close() }
  } finally { $source.Close() }
}

$pgDump = Join-Path $PgsqlBinDir 'pg_dump.exe'
if (-not (Test-Path $pgDump)) { throw "Missing $pgDump" }
if ([string]::IsNullOrEmpty($Directory)) { $Directory = Join-Path $DataDir 'backups' }
New-Item -ItemType Directory -Force -Path $Directory | Out-Null

$name = 'easypos-{0}.sql.gz' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
$file = Join-Path $Directory $name
$tmpSql = Join-Path $Directory ('.tmp-{0}.sql' -f [guid]::NewGuid().ToString('N'))

try {
  # --file keeps the dump out of the PowerShell pipeline (binary would be damaged there).
  # --clean --if-exists: the file can be loaded over a database that already has the tables.
  Invoke-WithShopDatabasePassword $DataDir {
    & $pgDump -h 127.0.0.1 -p $PortDb -U $DbUser -d $Database --clean --if-exists --no-owner --file=$tmpSql
  }
  if (($LASTEXITCODE -ne 0) -or (-not (Test-Path $tmpSql))) {
    throw 'The backup failed: is the database running? (net start tillumi-postgres)'
  }
  Compress-GzipFile $tmpSql $file
  # A dump that is only the gzip header means pg_dump failed.
  if (((Get-Item $file).Length) -lt 200) { throw 'The backup failed: is the database running? (net start tillumi-postgres)' }
  if (-not (Test-DumpComplete $file)) { throw 'The backup failed: the dump is incomplete (is the disk full?).' }
} catch {
  Remove-Item $file -ErrorAction SilentlyContinue
  throw
} finally {
  Remove-Item $tmpSql -ErrorAction SilentlyContinue
}
Write-Host "Backup saved: $file"

# Product images on this machine live under data\media; they go in a second file
# with the same name. A dump without images leaves whatever is there alone.
$mediaDir = Join-Path $DataDir 'data\media'
$mediaFile = Join-Path $Directory ($name -replace '\.sql\.gz$', '.media.tar.gz')
$hasImages = $false
if (Test-Path $mediaDir) {
  $first = Get-ChildItem -Path $mediaDir -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  $hasImages = ($null -ne $first)
}
if ($hasImages) {
  if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) { throw 'tar.exe not found: the images could not be saved.' }
  & tar.exe -czf $mediaFile -C $mediaDir .
  if ($LASTEXITCODE -ne 0) { Remove-Item $mediaFile -ErrorAction SilentlyContinue; throw 'The images could not be saved.' }
  & tar.exe -tzf $mediaFile | Out-Null
  if ($LASTEXITCODE -ne 0) { Remove-Item $mediaFile -ErrorAction SilentlyContinue; throw 'The images could not be saved.' }
  Write-Host "Images saved: $mediaFile"
}
Write-Host 'Keep a copy somewhere else too (another disk, or a cloud drive).'
