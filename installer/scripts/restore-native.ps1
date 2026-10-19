# Loads a backup made by backup-native.ps1. It REPLACES everything in the database.
#
#   .\installer\scripts\restore-native.ps1 -File <backup> -PgsqlBinDir '<InstallDir>\pgsql\bin' -DataDir '<DataDir>' [-Yes]
#
# All paths come from parameters (no hardcoded machine paths). When the shop later
# switches the cluster to password auth, set PGPASSWORD in the environment — libpq
# picks it up automatically, no script change needed. Stopping/starting the
# tillumi-pos service needs an elevated shell; without the service installed (a test
# box) the script warns and goes on, so stop the API yourself first.
param(
  [Parameter(Mandatory = $true)][string]$File,
  [Parameter(Mandatory = $true)][string]$PgsqlBinDir,
  [Parameter(Mandatory = $true)][string]$DataDir,
  [int]$PortDb = 5435,
  [string]$DbUser = 'pos',
  [string]$Database = 'pos',
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'

function Test-DumpComplete([string]$GzPath) {
  # Same completeness rule as backup-native.ps1; also proves the gzip is intact.
  # A damaged file throws while reading, which the caller turns into "damaged backup".
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

function Expand-GzipFile([string]$SourcePath, [string]$TargetPath) {
  $source = [IO.File]::OpenRead($SourcePath)
  try {
    $target = [IO.File]::Create($TargetPath)
    try {
      $gzip = New-Object IO.Compression.GzipStream($source, [IO.Compression.CompressionMode]::Decompress)
      $gzip.CopyTo($target)
      $gzip.Close()
    } finally { $target.Close() }
  } finally { $source.Close() }
}

if (-not (Test-Path $File)) {
  throw "File not found: $File`nUsage: restore-native.ps1 -File <backup> -PgsqlBinDir <bin> -DataDir <data> [-Yes]"
}
$psql = Join-Path $PgsqlBinDir 'psql.exe'
if (-not (Test-Path $psql)) { throw "Missing $psql" }

# Checked before anything is touched: a dump that was cut off would leave the
# database half empty.
try {
  $complete = Test-DumpComplete $File
} catch {
  throw "$File is not a valid backup (the file is damaged). Nothing was changed."
}
if (-not $complete) { throw "$File is not a complete backup (it was cut off). Nothing was changed." }

$mediaFile = $File -replace '\.sql\.gz$', '.media.tar.gz'
if (-not $Yes) {
  Write-Host "This replaces ALL data in the shop's database with the contents of: $File"
  if (Test-Path $mediaFile) { Write-Host "  and the product images in $mediaFile" }
  if ((Read-Host 'Type YES to go on') -ne 'YES') { Write-Host 'Cancelled.'; exit 1 }
}

$service = Get-Service 'tillumi-pos' -ErrorAction SilentlyContinue
$stoppedByMe = $false
if (($null -ne $service) -and ($service.Status -eq 'Running')) {
  try { Stop-Service 'tillumi-pos' -ErrorAction Stop }
  catch { throw "Could not stop the tillumi-pos service (run this script elevated). Nothing was changed. Details: $_" }
  $stoppedByMe = $true
} elseif ($null -eq $service) {
  Write-Warning 'tillumi-pos service is not installed: make sure the API is stopped before restoring.'
}

$tmpSql = Join-Path ([IO.Path]::GetTempPath()) ('restore-{0}.sql' -f [guid]::NewGuid().ToString('N'))
try {
  Expand-GzipFile $File $tmpSql
  Write-Host 'Loading the backup...'
  # One transaction: if anything in the file fails, the database is left exactly as it was.
  & $psql -h 127.0.0.1 -p $PortDb -U $DbUser -d $Database -v ON_ERROR_STOP=1 --single-transaction --quiet -f $tmpSql
  if ($LASTEXITCODE -ne 0) { throw 'The restore failed, and the database was left as it was.' }
} catch {
  if ($stoppedByMe) { Start-Service 'tillumi-pos' -ErrorAction SilentlyContinue }
  throw
} finally {
  Remove-Item $tmpSql -ErrorAction SilentlyContinue
}
if ($stoppedByMe) { Start-Service 'tillumi-pos' }

# The images saved with it, if any. A dump without them leaves the images that are there alone.
if (Test-Path $mediaFile) {
  if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) { throw "$mediaFile exists but tar.exe was not found; the database is restored but the images are not." }
  & tar.exe -tzf $mediaFile | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "$mediaFile is damaged; the database is restored but the images are not." }
  $mediaDir = Join-Path $DataDir 'data\media'
  New-Item -ItemType Directory -Force -Path $mediaDir | Out-Null
  Write-Host 'Restoring the images...'
  Get-ChildItem -Path $mediaDir -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  & tar.exe -xzf $mediaFile -C $mediaDir
  if ($LASTEXITCODE -ne 0) { throw "$mediaFile could not be unpacked; the database is restored but the images are not." }
}
Write-Host "Restored from $File"
