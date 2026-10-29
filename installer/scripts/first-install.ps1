# First-time setup for the TillumiPOS native Windows install (no Docker, no container).
# Run ONCE per machine by installer/tillumi.iss (Task 3). Safe to re-run: a finished
# machine is left alone (the existing cluster and .env are kept).
#
#   powershell -ExecutionPolicy Bypass -File first-install.ps1 `
#     -InstallDir 'C:\Program Files\TillumiPOS' `
#     -DataDir 'C:\ProgramData\TillumiPOS' `
#     -PgsqlDir 'C:\Program Files\TillumiPOS\pgsql'
#
# What it does:
#   1. Aborts when PORT_API/PORT_DB is already taken (TCP probe on 127.0.0.1).
#      Defaults are 3000 (API) and 5435 (postgres): 5432/5433/5434 may belong to
#      the developer's own databases, so the shop build never touches them.
#   2. Creates the data dirs (data\media, backups, logs) and locks the data folder
#      to SYSTEM and Administrators (protect-data-dir.ps1) before writing secrets.
#   3. initdb a fresh cluster ONLY when pgdata\PG_VERSION is absent, then creates
#      the `pos` database when it is missing. The cluster superuser is `pos`.
#   4. Writes <DataDir>\.env with random secrets ONLY when it is absent.
#
# DATABASE AUTH: postgres listens on 127.0.0.1 only (pg_hba.conf below and the
# service command line in tillumi-postgres.xml) and every connection needs the
# password (scram-sha-256). Without it, any program or Windows user on the till
# could sign in as the superuser and edit sales or run commands as the database
# service. The password is random, lives only in DATABASE_URL in .env, and the
# other scripts read it from there (shop-database.ps1). An older install that
# trusted local connections is switched to a password the next time this runs.
#
# SERVICE ACCOUNT: PostgreSQL runs as LocalService (it refuses LocalSystem).
# configure-postgres-service.ps1 grants read/execute on binaries and modify on
# pgdata/logs before startup, including clusters kept from older installations.
param(
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [Parameter(Mandatory = $true)][string]$DataDir,
  [Parameter(Mandatory = $true)][string]$PgsqlDir,
  [int]$PortDb = 5435,
  [int]$PortApi = 3000
)

$ErrorActionPreference = 'Stop'

function Test-PortFree([string]$TargetHost, [int]$Port) {
  # True when nothing listens: refused fast (EndConnect throws) or filtered (timeout).
  $client = New-Object Net.Sockets.TcpClient
  try {
    $wait = $client.BeginConnect($TargetHost, $Port, $null, $null)
    if (-not $wait.AsyncWaitHandle.WaitOne(500)) { return $true }
    try { $client.EndConnect($wait); return $false } catch { return $true }
  } finally { $client.Close() }
}

function New-Secret([int]$Length) {
  # Crypto RNG that also works on Windows PowerShell 5.1 (.NET Framework), where
  # RandomNumberGenerator.GetInt32 (used by scripts/install.ps1) does not exist.
  $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $bytes = New-Object byte[] $Length
    $rng.GetBytes($bytes)
    -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
  } finally { $rng.Dispose() }
}

if (-not (Test-Path $InstallDir)) { throw "Install dir not found: $InstallDir (the installer must copy the payload first)" }
$binDir = Join-Path $PgsqlDir 'bin'
foreach ($exe in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe', 'pg_dump.exe')) {
  if (-not (Test-Path (Join-Path $binDir $exe))) { throw "Postgres payload is incomplete: missing $binDir\$exe" }
}

foreach ($port in @($PortDb, $PortApi)) {
  if (-not (Test-PortFree '127.0.0.1' $port)) {
    throw "Port $port is already in use on this machine. Free it (or pick another port) and run again. Nothing was changed."
  }
}

$pgData = Join-Path $DataDir 'pgdata'
$mediaDir = Join-Path $DataDir 'data\media'
$backupDir = Join-Path $DataDir 'backups'
$logDir = Join-Path $DataDir 'logs'
foreach ($dir in @($DataDir, $mediaDir, $backupDir, $logDir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

# Lock the folder before any secret is written into it (see protect-data-dir.ps1).
& (Join-Path $PSScriptRoot 'protect-data-dir.ps1') -DataDir $DataDir

. (Join-Path $PSScriptRoot 'shop-database.ps1')
$envFile = Join-Path $DataDir '.env'
# Reuse the password of an existing install, so re-running never locks the API out of its own database.
$dbPassword = Get-ShopDatabasePassword (Read-ShopDatabaseUrl $DataDir)
if ($dbPassword -eq '') { $dbPassword = New-Secret 40 }
$databaseUrl = "postgres://pos:$dbPassword@127.0.0.1:$PortDb/pos"
$hba = Join-Path $pgData 'pg_hba.conf'
$serverLog = Join-Path $logDir 'initdb.log'

function Write-PgHba {
  # Loopback only, and every connection needs the password. Every other address is rejected
  # even if postgres were ever started listening wider.
  Set-Content -Path $hba -Value @(
    '# Written by installer/scripts/first-install.ps1.',
    '# Loopback only, password required (scram-sha-256). The password is in <DataDir>\.env,',
    '# which only SYSTEM and Administrators can read.',
    'local   all   all                   scram-sha-256',
    'host    all   all   127.0.0.1/32    scram-sha-256',
    'host    all   all   ::1/128         scram-sha-256',
    'host    all   all   0.0.0.0/0       reject',
    'host    all   all   ::/0            reject'
  ) -Encoding ascii
}

# A temporary server for setup work, always stopped again (the service starts the real one later).
function Invoke-WithTemporaryServer([scriptblock]$Body) {
  & (Join-Path $binDir 'pg_ctl.exe') start -D $pgData -l $serverLog -w -t 60 -o "-p $PortDb -c listen_addresses=127.0.0.1"
  if ($LASTEXITCODE -ne 0) { throw "postgres did not start for setup. See $serverLog" }
  try { & $Body } finally {
    & (Join-Path $binDir 'pg_ctl.exe') stop -D $pgData -m fast -w -t 60 | Out-Null
  }
}

$previousPgPassword = $env:PGPASSWORD
try {
  if (Test-Path (Join-Path $pgData 'PG_VERSION')) {
    Write-Host 'Database cluster already exists: keeping it.'
    # Installs made before passwords were used trusted every local connection. Give the role a
    # password while trust still lets us in, then require it.
    if ((Get-Content -Raw -LiteralPath $hba) -match '(?m)^\s*(local|host)\s.*\btrust\s*$') {
      Write-Host 'Switching the database from trust to a password...'
      $sqlFile = Join-Path $DataDir ('.set-password-' + [guid]::NewGuid().ToString('N') + '.sql')
      try {
        # A file in the locked folder, not a command-line argument other users could see.
        Set-Content -LiteralPath $sqlFile -Value "ALTER ROLE pos PASSWORD '$dbPassword';" -Encoding ascii
        Invoke-WithTemporaryServer {
          & (Join-Path $binDir 'psql.exe') -h 127.0.0.1 -p $PortDb -U pos -d postgres -v ON_ERROR_STOP=1 -q -f $sqlFile
          if ($LASTEXITCODE -ne 0) { throw 'Could not set the database password. Nothing else was changed.' }
        }
      } finally { Remove-Item -LiteralPath $sqlFile -Force -ErrorAction SilentlyContinue }
      Write-PgHba
    }
  } else {
    Write-Host 'Creating the database cluster...'
    $pwFile = Join-Path $DataDir ('.initdb-' + [guid]::NewGuid().ToString('N'))
    try {
      Set-Content -LiteralPath $pwFile -Value $dbPassword -Encoding ascii -NoNewline
      & (Join-Path $binDir 'initdb.exe') -D $pgData -U pos -E UTF8 --auth-local=scram-sha-256 --auth-host=scram-sha-256 "--pwfile=$pwFile"
      if ($LASTEXITCODE -ne 0) { throw 'initdb failed.' }
    } finally { Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue }
    Write-PgHba
  }

  # Create the `pos` database when it is missing. Checked on every run, so an install that stopped
  # between initdb and createdb finishes the job instead of skipping it forever.
  $env:PGPASSWORD = $dbPassword
  Invoke-WithTemporaryServer {
    $exists = & (Join-Path $binDir 'psql.exe') -h 127.0.0.1 -p $PortDb -U pos -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = 'pos'"
    if ($LASTEXITCODE -ne 0) {
      throw 'Cannot sign in to the shop database. If <DataDir>\.env was deleted, its database password is lost: restore .env from a backup copy.'
    }
    if ("$exists".Trim() -ne '1') {
      & (Join-Path $binDir 'createdb.exe') -h 127.0.0.1 -p $PortDb -U pos pos
      if ($LASTEXITCODE -ne 0) { throw 'Could not create the pos database.' }
    }
  }
  Write-Host 'Database cluster ready.'
} finally {
  $env:PGPASSWORD = $previousPgPassword
}

if (Test-Path $envFile) {
  # Keep the shop's secrets; only bring an old passwordless DATABASE_URL up to date.
  $lines = @(Get-Content -LiteralPath $envFile)
  $updated = $lines | ForEach-Object { if ($_ -match '^\s*DATABASE_URL\s*=') { "DATABASE_URL=$databaseUrl" } else { $_ } }
  if (($updated -join "`n") -ne ($lines -join "`n")) {
    Set-Content -LiteralPath $envFile -Value $updated -Encoding ascii
    Write-Host "Updated DATABASE_URL in $envFile"
  } else {
    Write-Host '.env already exists: keeping it.'
  }
} else {
  # No MEDIA_TOKEN line on purpose: with no token the API keeps product images on
  # this machine's disk (data\media), which backup-native.ps1 saves next to the dump.
  # CHECKOUT_MODE=shifts: the v1 money routes are retired, selling goes through
  # /api/v2 with an open shift.
  Set-Content -Path $envFile -Value @(
    '# Written by installer/scripts/first-install.ps1. Keep this file private: it holds the secrets of this shop.',
    "DATABASE_URL=$databaseUrl",
    "JWT_SECRET=$(New-Secret 64)",
    "PORT=$PortApi",
    'CHECKOUT_MODE=shifts',
    'MEDIA_STORAGE=local',
    'MEDIA_DIR=./data/media',
    'COOKIE_SECURE=false'
  ) -Encoding ascii
  Write-Host "Wrote $envFile"
}

Write-Host ''
Write-Host "Data dir: $DataDir"
Write-Host "API port: $PortApi, database port: $PortDb"
Write-Host 'Next (needs an ELEVATED shell, done by installer/tillumi.iss in Task 3):'
Write-Host '  tillumi-postgres.exe install; net start tillumi-postgres'
Write-Host '  tillumi-pos.exe install; net start tillumi-pos'
