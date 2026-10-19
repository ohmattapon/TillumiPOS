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
#   2. Creates the data dirs (data\media, backups, logs).
#   3. initdb a fresh cluster ONLY when pgdata\PG_VERSION is absent, then creates
#      the `pos` database. The cluster superuser is `pos` (see AUTH TRADEOFF below).
#   4. Writes <DataDir>\.env with random secrets ONLY when it is absent.
#
# AUTH TRADEOFF (trust on 127.0.0.1, no DB password — kept SIMPLE on purpose,
# matching the Task 1 spike): any process ON THIS MACHINE can open the database.
# That is acceptable because (a) postgres listens on 127.0.0.1 only — enforced in
# BOTH pg_hba.conf below and the service command line in tillumi-postgres.xml —
# so no other machine can reach it, and (b) this is a single-till shop box where
# the Windows user boundary is the real protection. A DB password would add
# nothing against a local attacker who can already read <DataDir>\.env.
# If the shop later switches to scram-sha-256, the DATABASE_URL in .env (and the
# <env> backstop in tillumi-pos.xml) must gain the password; backup/restore read
# it from the PGPASSWORD environment variable automatically.
#
# SERVICE ACCOUNT (for Task 3): services run as LocalSystem by default, which can
# already write everywhere below. If Task 3 switches to a dedicated account, Inno
# must grant it full control BEFORE starting the services, e.g.:
#   icacls "$DataDir" /grant 'NT SERVICE\tillumi-postgres:(OI)(CI)F' /T
#   icacls "$DataDir" /grant 'NT SERVICE\tillumi-pos:(OI)(CI)F' /T
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

if (Test-Path (Join-Path $pgData 'PG_VERSION')) {
  Write-Host 'Database cluster already exists: keeping it.'
} else {
  Write-Host 'Creating the database cluster...'
  & (Join-Path $binDir 'initdb.exe') -D $pgData -U pos -E UTF8 --auth-local=trust --auth-host=trust
  if ($LASTEXITCODE -ne 0) { throw 'initdb failed.' }

  # Lock trust down to loopback: even if postgres ever listened wider, non-local
  # machines are still rejected here. (initdb --auth-host=trust alone would trust
  # the whole network, which we do not want.)
  $hba = Join-Path $pgData 'pg_hba.conf'
  Copy-Item $hba "$hba.install-bak" -Force
  Set-Content -Path $hba -Value @(
    '# Written by installer/scripts/first-install.ps1.',
    '# Trust is LOOPBACK ONLY: the service never listens beyond 127.0.0.1, and every',
    '# non-loopback address is rejected here even if it ever did. See the AUTH TRADEOFF',
    '# note at the top of first-install.ps1.',
    'local   all   all                   trust',
    'host    all   all   127.0.0.1/32    trust',
    'host    all   all   ::1/128         trust',
    'host    all   all   0.0.0.0/0       reject',
    'host    all   all   ::/0            reject'
  ) -Encoding ascii

  # A temporary server (stopped in `finally`) only to create the `pos` database.
  $initLog = Join-Path $logDir 'initdb.log'
  try {
    & (Join-Path $binDir 'pg_ctl.exe') start -D $pgData -l $initLog -w -t 60 -o "-p $PortDb -c listen_addresses=127.0.0.1"
    if ($LASTEXITCODE -ne 0) { throw "postgres did not start for first-time setup. See $initLog" }
    & (Join-Path $binDir 'createdb.exe') -h 127.0.0.1 -p $PortDb -U pos pos
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the pos database.' }
  } finally {
    & (Join-Path $binDir 'pg_ctl.exe') stop -D $pgData -m fast -w -t 60 | Out-Null
  }
  Write-Host 'Database cluster ready.'
}

$envFile = Join-Path $DataDir '.env'
if (Test-Path $envFile) {
  Write-Host '.env already exists: keeping it. Delete it first to make a fresh one.'
} else {
  # No MEDIA_TOKEN line on purpose: with no token the API keeps product images on
  # this machine's disk (data\media), which backup-native.ps1 saves next to the dump.
  # CHECKOUT_MODE=shifts: the v1 money routes are retired, selling goes through
  # /api/v2 with an open shift.
  Set-Content -Path $envFile -Value @(
    '# Written by installer/scripts/first-install.ps1. Keep this file private: it holds the secrets of this shop.',
    "DATABASE_URL=postgres://pos@127.0.0.1:$PortDb/pos",
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
