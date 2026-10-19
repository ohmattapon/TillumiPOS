# No side effects when dot-sourced: tests replace the I/O functions below.
function New-ShopSecret {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Initialize-ShopSettings([string]$ShopDirectory) {
  New-Item -ItemType Directory -Force $ShopDirectory | Out-Null
  $path = Join-Path $ShopDirectory '.env'
  if (Test-Path $path) { return }
  $text = "POSTGRES_PASSWORD=$(New-ShopSecret)`nJWT_SECRET=$(New-ShopSecret)`nPORT=3000`nCOOKIE_SECURE=false`nCHECKOUT_MODE=shifts`nMEDIA_STORAGE=local`n"
  # CreateNew prevents a second process from replacing the first shop's secrets.
  $file = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $bytes = [Text.Encoding]::ASCII.GetBytes($text); $file.Write($bytes, 0, $bytes.Length) } finally { $file.Dispose() }
}

function Get-ShopPort([string]$ShopDirectory) {
  $line = Get-Content (Join-Path $ShopDirectory '.env') | Where-Object { $_ -match '^PORT=' } | Select-Object -Last 1
  $value = if ($line) { $line.Substring(5) } else { '3000' }
  $port = 0
  if (-not [int]::TryParse($value, [ref]$port) -or $port -lt 1024 -or $port -gt 65535) { throw 'INVALID_PORT' }
  $port
}

function Read-InstallerPayload([string]$PayloadDirectory) {
  $manifest = Get-Content (Join-Path $PayloadDirectory 'manifest.json') -Raw | ConvertFrom-Json
  if ($manifest.version -notmatch '^\d+\.\d+\.\d+$' -or $manifest.image -cne "localhost/tillumipos:$($manifest.version)") { throw 'INVALID_PAYLOAD' }
  foreach ($entry in @(@{ Name = 'app-image.tar'; Hash = $manifest.sha256 }, @{ Name = 'docker-compose.yml'; Hash = $manifest.composeSha256 })) {
    if ($entry.Hash -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash (Join-Path $PayloadDirectory $entry.Name) -Algorithm SHA256).Hash -ine $entry.Hash) { throw 'INVALID_PAYLOAD' }
  }
  $manifest
}

function Write-InstallerStatus([string]$ShopDirectory, [string]$Stage) {
  # Stages are an allowlist controlled by this program, never native output, .env or setup codes.
  Add-Content -LiteralPath (Join-Path $ShopDirectory 'launcher.log') -Value "$(Get-Date -Format s) $Stage" -Encoding UTF8
}

function Use-ShopConnection {
  # Only this worker's environment changes; somebody else's Docker/Podman context stays untouched.
  foreach ($name in @('DOCKER_HOST', 'DOCKER_CONTEXT', 'CONTAINER_HOST', 'PODMAN_COMPOSE_PROVIDER', 'COMPOSE_PROFILES')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  $env:CONTAINER_CONNECTION = 'tillumipos-root'
}

function Initialize-InstallerEngine([string]$ProgramDirectory) {
  Use-ShopConnection
  . (Join-Path $ProgramDirectory 'payload/scripts/podman-windows.ps1')
  $script:Podman = Find-Podman
  if (-not $script:Podman) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'PREREQUISITE_MISSING' }
    & winget install --id RedHat.Podman -e --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
    $script:Podman = Find-Podman
    if (-not $script:Podman) { throw 'PREREQUISITE_MISSING' }
  }
  # A shop never stops, reconfigures or adopts somebody else's default machine.
  $machines = @(Invoke-ShopPodman machine list --format json | Out-String | ConvertFrom-Json)
  if (-not ($machines | Where-Object { $_.Name -eq 'tillumipos' })) {
    Invoke-ShopPodman machine init --rootful tillumipos | Out-Null
  }
  $machine = @(Invoke-ShopPodman machine inspect tillumipos | Out-String | ConvertFrom-Json) | Select-Object -First 1
  if (-not $machine.Rootful) { throw 'ENGINE_CONFLICT' }
  if ($machine.State -ne 'running') { Invoke-ShopPodman machine start tillumipos | Out-Null }
  Set-ComposeProvider
  Use-AnonymousRegistryPulls
}

function Invoke-ShopPodman {
  # PS 5.1 turns even successful native stderr progress into terminating errors under Stop.
  $previous = $ErrorActionPreference
  try { $ErrorActionPreference = 'Continue'; $result = & $script:Podman @args 2>&1; $code = $LASTEXITCODE }
  finally { $ErrorActionPreference = $previous }
  if ($code -ne 0) { throw 'ENGINE_COMMAND_FAILED' }
  $result
}

function Invoke-ShopCompose {
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $result = & $script:Podman compose --project-name tillumipos --project-directory $script:ShopDirectory -f (Join-Path $script:ShopDirectory 'docker-compose.yml') @args 2>&1
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  if ($code -ne 0) { throw 'COMPOSE_COMMAND_FAILED' }
  $result
}

function Test-ShopHealth([int]$Port) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$Port/api/v1/health"
    return $response.StatusCode -eq 200
  } catch { return $false }
}

function Wait-ShopHealth([int]$Port) {
  foreach ($attempt in 1..90) {
    if (Test-ShopHealth $Port) { return }
    Start-Sleep -Seconds 2
  }
  throw 'HEALTH_FAILED'
}

function Assert-ShopPortAvailable([int]$Port, [string]$ProgramDirectory) {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  if (-not $listeners.Count) { return }
  # An existing LAN -> localhost proxy is reusable by WSL. It is not an app bound to localhost.
  . (Join-Path $ProgramDirectory 'payload/scripts/lan-address.ps1')
  $forwarded = @(Get-ForwardedAddresses @(netsh interface portproxy show v4tov4) ([string]$Port))
  foreach ($listener in $listeners) {
    if ($listener.LocalAddress -in @('127.0.0.1', '::1', '0.0.0.0', '::') -or $listener.LocalAddress -notin $forwarded) { throw 'PORT_IN_USE' }
  }
}

function Get-ShopSetupCode([int]$Port) {
  # The code is returned in memory to the local GUI only. It never enters a file or URL.
  try { $setup = Invoke-RestMethod -TimeoutSec 5 "http://127.0.0.1:$Port/api/v1/setup" } catch { return $null }
  if (-not $setup.needsSetup) { return $null }
  $lines = Invoke-ShopCompose logs --tail 100 app | Out-String
  $found = [regex]::Matches($lines, 'SETUP CODE[^:]*:\s+([A-Z0-9]+)') | Select-Object -Last 1
  if ($found) { return $found.Groups[1].Value }
  return $null
}

function Invoke-ShopBackup([string]$ShopDirectory) {
  Write-InstallerStatus $ShopDirectory 'BACKING_UP'
  $name = 'tillumipos-{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
  $directory = Join-Path $ShopDirectory "backups/$name"
  New-Item -ItemType Directory -Force $directory | Out-Null
  $dbFile = Join-Path $directory 'shop.sql.gz'
  Invoke-ShopCompose exec -T db sh -c 'pg_dump -U pos -d pos --clean --if-exists --no-owner | gzip > /tmp/installer-backup.sql.gz' | Out-Null
  Invoke-ShopCompose exec -T db sh -c 'gunzip -c /tmp/installer-backup.sql.gz | tail -n 20 | grep -q PostgreSQL.database.dump.complete' | Out-Null
  Invoke-ShopCompose cp db:/tmp/installer-backup.sql.gz $dbFile | Out-Null
  if (-not (Test-Path $dbFile) -or (Get-Item $dbFile).Length -lt 200) { throw 'BACKUP_FAILED' }
  # podman cp also works on stopped containers: upgrades can quiesce app writes before both snapshots.
  $id = (Invoke-ShopCompose ps -a -q app | Out-String).Trim()
  if ($id -notmatch '^[a-f0-9]{12,64}$') { throw 'BACKUP_FAILED' }
  $mediaDirectory = Join-Path $directory 'media'
  New-Item -ItemType Directory $mediaDirectory -Force | Out-Null
  Invoke-ShopPodman cp "${id}:/data/media/." $mediaDirectory | Out-Null
  & tar.exe -czf (Join-Path $directory 'shop.media.tar.gz') -C $mediaDirectory . 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'BACKUP_FAILED' }
  # Keep the raw media copy too; an interrupted cleanup must never invalidate the backup.
  Invoke-ShopCompose exec -T db rm -f /tmp/installer-backup.sql.gz | Out-Null
  Copy-Item (Join-Path $ShopDirectory 'docker-compose.yml') (Join-Path $directory 'docker-compose.yml')
  if (Test-Path (Join-Path $ShopDirectory 'installed-version.json')) { Copy-Item (Join-Path $ShopDirectory 'installed-version.json') $directory }
  Write-InstallerStatus $ShopDirectory 'BACKUP_READY'
  $directory
}

function Start-InstalledShop([string]$ProgramDirectory, [string]$ShopDirectory) {
  $script:ShopDirectory = $ShopDirectory
  Initialize-ShopSettings $ShopDirectory
  Write-InstallerStatus $ShopDirectory 'VALIDATING'
  $payload = Join-Path $ProgramDirectory 'payload'
  $manifest = Read-InstallerPayload $payload
  $port = Get-ShopPort $ShopDirectory
  $versionFile = Join-Path $ShopDirectory 'installed-version.json'
  $activeCompose = Join-Path $ShopDirectory 'docker-compose.yml'
  $installed = if (Test-Path $versionFile) { Get-Content $versionFile -Raw | ConvertFrom-Json } else { $null }
  $pendingFile = Join-Path $ShopDirectory 'pending-version.json'
  $pending = if (Test-Path $pendingFile) { Get-Content $pendingFile -Raw | ConvertFrom-Json } else { $null }
  if (-not $installed -and (Test-Path $activeCompose) -and (-not $pending -or $pending.sha256 -ne $manifest.sha256)) { throw 'INCOMPLETE_INSTALL' }
  if ($installed -and [version]$installed.version -gt [version]$manifest.version) { throw 'DOWNGRADE_BLOCKED' }
  # A failed health check can follow a successful migration. Pending is a schema high-water mark too.
  if ($pending -and [version]$pending.version -gt [version]$manifest.version) { throw 'DOWNGRADE_BLOCKED' }
  foreach ($recorded in @($installed, $pending)) {
    if ($recorded -and $recorded.version -eq $manifest.version) {
      if (($recorded.sha256 -and $recorded.sha256 -ne $manifest.sha256) -or ($recorded.composeSha256 -and $recorded.composeSha256 -ne $manifest.composeSha256)) { throw 'VERSION_REUSED' }
    }
  }
  $changed = -not $installed -or $installed.version -ne $manifest.version
  if (-not $installed -and -not $pending) { Assert-ShopPortAvailable $port $ProgramDirectory }
  Write-InstallerStatus $ShopDirectory 'STARTING_ENGINE'
  Initialize-InstallerEngine $ProgramDirectory
  if ($changed) {
    if ($installed) {
      Write-InstallerStatus $ShopDirectory 'STOPPING_FOR_UPDATE'
      Invoke-ShopCompose up -d --no-build --wait db | Out-Null
      Invoke-ShopCompose stop app | Out-Null
      try { Invoke-ShopBackup $ShopDirectory | Out-Null }
      catch {
        # Only the unchanged old app is restarted when no migration has been attempted.
        if (-not $pending) { Invoke-ShopCompose start app | Out-Null }
        throw 'BACKUP_FAILED'
      }
      if (-not $pending) {
        Copy-Item $activeCompose (Join-Path $ShopDirectory 'docker-compose.previous.yml')
      }
    }
    Write-InstallerStatus $ShopDirectory 'LOADING_IMAGE'
    Invoke-ShopPodman load --input (Join-Path $payload 'app-image.tar') | Out-Null
    # Never pull an identically named release from a registry if the archive has the wrong tag.
    Invoke-ShopPodman image exists $manifest.image | Out-Null
    $manifest | ConvertTo-Json | Set-Content $pendingFile -Encoding ASCII
    Copy-Item (Join-Path $payload 'docker-compose.yml') $activeCompose -Force
    if (Test-Path (Join-Path $payload 'Caddyfile')) { Copy-Item (Join-Path $payload 'Caddyfile') $ShopDirectory -Force }
  }
  Write-InstallerStatus $ShopDirectory 'STARTING_SHOP'
  Invoke-ShopCompose up -d --no-build --pull missing | Out-Null
  Wait-ShopHealth $port
  if ($changed) {
    $temporary = Join-Path $ShopDirectory 'installed-version.pending.json'
    $manifest | ConvertTo-Json | Set-Content $temporary -Encoding ASCII
    Move-Item $temporary $versionFile -Force
    Remove-Item $pendingFile -ErrorAction SilentlyContinue
  }
  Write-InstallerStatus $ShopDirectory 'READY'
  @{ Url = "http://localhost:$port"; Port = $port; Version = $manifest.version; SetupCode = Get-ShopSetupCode $port }
}
