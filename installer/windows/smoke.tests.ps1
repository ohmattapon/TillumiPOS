param([Parameter(Mandatory = $true)][string]$ProgramDirectory)
# Explicitly disposable engine only. Never run the real launcher or initialize a production machine here.
$ErrorActionPreference = 'Stop'
if ($env:CONTAINER_CONNECTION -cne 'tillumipos-installer-test-root') { throw 'Select the disposable tillumipos-installer-test-root connection explicitly' }
. "$PSScriptRoot/runtime.ps1"
$smokeRoot = Join-Path ([IO.Path]::GetTempPath()) ('tillumipos-smoke-' + [guid]::NewGuid().ToString('N'))
$shop = Join-Path $smokeRoot 'shop'
Initialize-ShopSettings $shop
(Get-Content (Join-Path $shop '.env')) -replace '^PORT=3000$', 'PORT=13070' | Set-Content (Join-Path $shop '.env') -Encoding ASCII
$settingsHash = (Get-FileHash (Join-Path $shop '.env')).Hash
function Initialize-InstallerEngine([string]$ProgramDirectory) {
  . (Join-Path $ProgramDirectory 'payload/scripts/podman-windows.ps1')
  $script:Podman = Find-Podman
  Set-ComposeProvider
  Use-AnonymousRegistryPulls
}
function Assert($Value, $Message) { if (-not $Value) { throw $Message } }
try {
  $result = Start-InstalledShop $ProgramDirectory $shop
  Assert ($result.Port -eq 13070) 'Wrong port'
  Assert ($result.SetupCode -match '^[A-Z0-9]+$') 'No first-run code returned in memory'
  Invoke-ShopCompose exec -T db psql -U pos -d pos -v ON_ERROR_STOP=1 -c 'CREATE TABLE installer_canary (id integer PRIMARY KEY); INSERT INTO installer_canary VALUES (73);' | Out-Null
  Invoke-ShopCompose exec -T app sh -c 'mkdir -p /data/media/products; echo canary-media > /data/media/products/installer-canary.txt' | Out-Null
  Invoke-ShopCompose stop app | Out-Null
  try { $saved = Invoke-ShopBackup $shop } finally { Invoke-ShopCompose start app | Out-Null }
  Assert (Test-Path (Join-Path $saved 'shop.sql.gz')) 'Database snapshot missing'
  Assert (Test-Path (Join-Path $saved 'shop.media.tar.gz')) 'Media archive missing'
  $listing = & tar.exe -tzf (Join-Path $saved 'shop.media.tar.gz')
  Assert ($listing -match 'installer-canary.txt') 'Media canary not backed up'
  Wait-ShopHealth 13070
  Start-InstalledShop $ProgramDirectory $shop | Out-Null
  Assert ((Get-FileHash (Join-Path $shop '.env')).Hash -eq $settingsHash) 'Restart changed settings'
  $value = Invoke-ShopCompose exec -T db psql -U pos -d pos -Atc 'SELECT id FROM installer_canary;'
  Assert (($value | Out-String).Trim() -eq '73') 'Restart lost database canary'
  # Exercise the actual update path over the same app build; this is orchestration proof, not a new schema migration.
  $record = Get-Content (Join-Path $shop 'installed-version.json') -Raw | ConvertFrom-Json
  $record.version = '0.0.0'
  $record | ConvertTo-Json | Set-Content (Join-Path $shop 'installed-version.json')
  Start-InstalledShop $ProgramDirectory $shop | Out-Null
  $value = Invoke-ShopCompose exec -T db psql -U pos -d pos -Atc 'SELECT id FROM installer_canary;'
  Assert (($value | Out-String).Trim() -eq '73') 'Update lost database canary'
  Assert ((Get-FileHash (Join-Path $shop '.env')).Hash -eq $settingsHash) 'Update changed settings'
  Assert (@(Get-ChildItem (Join-Path $shop 'backups') -Directory).Count -eq 2) 'Update did not produce checked backup'
  Write-Host "PASS: real image start, health, memory-only setup code, database/media backup, restart and update orchestration. Evidence: $smokeRoot"
} finally {
  # Containers/volumes here belong to the disposable test machine, not the live/default machine.
  if (Test-Path (Join-Path $shop 'docker-compose.yml')) { Invoke-ShopCompose down --volumes | Out-Null }
}
