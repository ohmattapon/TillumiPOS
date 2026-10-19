$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/runtime.ps1"
$engineImplementation = ${function:Initialize-InstallerEngine}
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('tillumipos-test-' + [guid]::NewGuid())
New-Item -ItemType Directory $testRoot | Out-Null
function Assert($Condition, $Message) { if (-not $Condition) { throw $Message } }
function Must-Fail([scriptblock]$Code, [string]$Message) {
  $failed = $false
  try { & $Code | Out-Null } catch { $failed = $true }
  Assert $failed $Message
}
try {
  $shop = Join-Path $testRoot 'shop'
  Initialize-ShopSettings $shop
  $before = [IO.File]::ReadAllText((Join-Path $shop '.env'))
  Initialize-ShopSettings $shop
  Assert ($before -ceq [IO.File]::ReadAllText((Join-Path $shop '.env'))) 'Existing settings changed'
  Assert ($before -match 'POSTGRES_PASSWORD=[a-f0-9]{64}') 'Password must use cryptographic random bytes'
  Assert ((Get-ShopPort $shop) -eq 3000) 'Default port missing'
  Add-Content (Join-Path $shop '.env') 'PORT=invalid'
  Must-Fail { Get-ShopPort $shop } 'Invalid port accepted'
  Set-Content (Join-Path $shop '.env') $before -Encoding ascii

  $payload = Join-Path $testRoot 'payload'
  New-Item -ItemType Directory $payload | Out-Null
  Set-Content (Join-Path $payload 'app-image.tar') 'test image'
  Set-Content (Join-Path $payload 'docker-compose.yml') 'services: {}'
  $manifest = @{ version = '1.2.3'; image = 'localhost/tillumipos:1.2.3'; sha256 = (Get-FileHash (Join-Path $payload 'app-image.tar')).Hash; composeSha256 = (Get-FileHash (Join-Path $payload 'docker-compose.yml')).Hash }
  $manifest | ConvertTo-Json | Set-Content (Join-Path $payload 'manifest.json')
  Assert ((Read-InstallerPayload $payload).version -eq '1.2.3') 'Valid manifest rejected'
  Add-Content (Join-Path $payload 'app-image.tar') 'tamper'
  Must-Fail { Read-InstallerPayload $payload } 'Tampered archive accepted'
  $manifest.sha256 = (Get-FileHash (Join-Path $payload 'app-image.tar')).Hash
  $manifest.version = '../bad'
  $manifest | ConvertTo-Json | Set-Content (Join-Path $payload 'manifest.json')
  Must-Fail { Read-InstallerPayload $payload } 'Invalid version accepted'

  # A pre-existing running machine belongs to somebody else; only the dedicated machine may be started.
  $engineProgram = Join-Path $testRoot 'engine-program'
  New-Item -ItemType Directory (Join-Path $engineProgram 'payload/scripts') -Force | Out-Null
  @'
function Find-Podman { 'mock-podman' }
function Set-ComposeProvider { }
function Use-AnonymousRegistryPulls { }
'@ | Set-Content (Join-Path $engineProgram 'payload/scripts/podman-windows.ps1')
  $script:engineCalls = [Collections.Generic.List[string]]::new()
  function Invoke-ShopPodman {
    $script:engineCalls.Add(($args -join ' '))
    if (($args -join ' ') -eq 'machine list --format json') { '[{"Name":"other-project"}]' }
    if (($args -join ' ') -eq 'machine inspect tillumipos') { '[{"Rootful":true,"State":"stopped"}]' }
  }
  $originalConnection = $env:CONTAINER_CONNECTION
  $env:DOCKER_HOST = 'tcp://unrelated-engine:2375'
  $env:CONTAINER_HOST = 'ssh://unrelated-engine/run/podman.sock'
  try {
    & $engineImplementation $engineProgram
    Assert ($env:CONTAINER_CONNECTION -eq 'tillumipos-root') 'Dedicated connection not selected'
    Assert (-not $env:DOCKER_HOST -and -not $env:CONTAINER_HOST) 'Inherited engine host can redirect the shop'
  }
  finally { $env:CONTAINER_CONNECTION = $originalConnection }
  Assert ($script:engineCalls -contains 'machine init --rootful tillumipos') 'Dedicated machine not created'
  Assert ($script:engineCalls -contains 'machine start tillumipos') 'Dedicated machine not started'
  Assert (-not ($script:engineCalls -match 'stop|set --rootful|other-project')) 'Another machine was changed'

  # Drive the actual update orchestration, replacing only external operations.
  $script:stages = [Collections.Generic.List[string]]::new()
  function Write-InstallerStatus($ShopDirectory, $Stage) { $script:stages.Add($Stage) }
  function Initialize-InstallerEngine($ProgramDirectory) { }
  function Test-ShopHealth($Port) { return $true }
  function Wait-ShopHealth($Port) { }
  function Assert-ShopPortAvailable($Port) { }
  function Invoke-ShopCompose { $script:stages.Add(($args -join ' ')) }
  function Invoke-ShopPodman { $script:stages.Add(($args -join ' ')) }
  function Get-ShopSetupCode { return $null }
  function Invoke-ShopBackup { throw 'BACKUP_FAILED' }
  $program = Join-Path $testRoot 'program'
  New-Item -ItemType Directory $program | Out-Null
  Move-Item $payload (Join-Path $program 'payload')
  $payload = Join-Path $program 'payload'
  $manifest.version = '1.2.3'
  $manifest | ConvertTo-Json | Set-Content (Join-Path $payload 'manifest.json')
  Set-Content (Join-Path $shop 'docker-compose.yml') 'old compose'
  @{ version = '1.0.0' } | ConvertTo-Json | Set-Content (Join-Path $shop 'installed-version.json')
  Must-Fail { Start-InstalledShop $program $shop } 'Update continued after failed backup'
  Assert ((Get-Content (Join-Path $shop 'docker-compose.yml') -Raw).Trim() -eq 'old compose') 'Compose changed before backup'
  Assert ((Get-Content (Join-Path $shop 'installed-version.json') -Raw | ConvertFrom-Json).version -eq '1.0.0') 'Failed update marked installed'
  Assert (-not ($script:stages -match '^up -d --no-build --pull missing$')) 'Started new version after backup failure'

  function Invoke-ShopBackup { $script:stages.Add('backup') }
  function Wait-ShopHealth { throw 'HEALTH_FAILED' }
  Must-Fail { Start-InstalledShop $program $shop } 'Failed health accepted'
  Assert ((Get-Content (Join-Path $shop 'installed-version.json') -Raw | ConvertFrom-Json).version -eq '1.0.0') 'Failed health marked installed'
  Assert (Test-Path (Join-Path $shop 'docker-compose.previous.yml')) 'Recovery compose missing'
  Assert ($script:stages.IndexOf('backup') -lt $script:stages.FindIndex([Predicate[string]]{ param($s) $s -match '^up -d --no-build --pull missing$' })) 'Upgrade ran before backup'

  function Wait-ShopHealth { }
  $result = Start-InstalledShop $program $shop
  Assert ($result.Version -eq '1.2.3') 'Successful update result missing'
  Assert ((Get-Content (Join-Path $shop 'installed-version.json') -Raw | ConvertFrom-Json).version -eq '1.2.3') 'Successful update not recorded'
  $script:stages.Clear()
  Start-InstalledShop $program $shop | Out-Null
  Assert (-not ($script:stages -contains 'backup')) 'Unchanged version backed up again'
  Assert (-not ($script:stages -match '^load')) 'Unchanged version reloaded'
  $differentPending = $manifest.Clone()
  $differentPending.sha256 = '0' * 64
  $differentPending | ConvertTo-Json | Set-Content (Join-Path $shop 'pending-version.json')
  Must-Fail { Start-InstalledShop $program $shop } 'A pending release accepted different content under the same version'

  $manifest.version = '2.0.0'
  $manifest.image = 'localhost/tillumipos:2.0.0'
  $manifest | ConvertTo-Json | Set-Content (Join-Path $shop 'pending-version.json')
  Must-Fail { Start-InstalledShop $program $shop } 'A failed migration allowed an older target'
  Write-Host 'PASS: pending migrations also block downgrades'
  # Uninstalling before the first start must not install/start Podman or create shop credentials.
  'function Find-Podman { $null }' | Set-Content (Join-Path $engineProgram 'payload/scripts/podman-windows.ps1')
  $stopShop = Join-Path $testRoot 'never-started'
  $stopOutput = & powershell -NoProfile -File "$PSScriptRoot/worker.ps1" -Action Stop -ProgramDirectory $engineProgram -ShopDirectory $stopShop
  Assert (($stopOutput | ConvertFrom-Json).Ok) 'Stopping a never-started installation failed'
  Assert (-not (Test-Path (Join-Path $stopShop '.env'))) 'Uninstall created shop credentials'
  Write-Host 'PASS: settings, payload validation, backup failure, health failure, update order, idempotent startup'
} finally {
  # This path is a newly generated test directory; never the installed shop.
  if ($testRoot.StartsWith([IO.Path]::GetTempPath()) -and (Split-Path $testRoot -Leaf) -like 'tillumipos-test-*') {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
