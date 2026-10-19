$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/runtime.ps1"
$engineImplementation = ${function:Initialize-InstallerEngine}
$portImplementation = ${function:Assert-ShopPortAvailable}
$nativeCommandImplementation = ${function:Invoke-ShopPodman}
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

  $portProgram = Join-Path $testRoot 'port-program'
  New-Item -ItemType Directory (Join-Path $portProgram 'payload/scripts') -Force | Out-Null
  Copy-Item "$PSScriptRoot/../../scripts/lan-address.ps1" (Join-Path $portProgram 'payload/scripts/lan-address.ps1')
  function Get-NetTCPConnection { foreach ($address in @($script:listeningAddress)) { [pscustomobject]@{ LocalAddress = $address; LocalPort = 3000 } } }
  function netsh { '192.168.1.34    3000    127.0.0.1    3000' }
  $script:listeningAddress = '192.168.1.34'
  & $portImplementation 3000 $portProgram
  foreach ($address in @('127.0.0.1', '::1', '0.0.0.0', '::', '192.168.1.35')) {
    $script:listeningAddress = $address
    Must-Fail { & $portImplementation 3000 $portProgram } "Accepted occupied address $address"
  }
  $script:listeningAddress = @('192.168.1.34', '127.0.0.1')
  Must-Fail { & $portImplementation 3000 $portProgram } 'A proxy hid an actual localhost listener'
  Remove-Item Function:\Get-NetTCPConnection
  Remove-Item Function:\netsh

  $script:ShopDirectory = $shop
  $fakeCommand = Join-Path $testRoot 'native-failure.cmd'
  [IO.File]::WriteAllText($fakeCommand, "@echo off`r`necho connection reset by peer https://example.invalid/private-marker`r`necho password=private-credential`r`nexit /b 125`r`n", [Text.Encoding]::ASCII)
  $script:Podman = $fakeCommand
  try { & $nativeCommandImplementation machine init --rootful tillumipos; throw 'Native failure was accepted' }
  catch {
    Assert ($_.Exception.Message -eq 'ENGINE_INIT_FAILED') 'Native failure did not identify init stage'
    Assert ($_.Exception.Data['Reason'] -eq 'NETWORK') 'Native failure reason lost'
    Assert ($_.Exception.Data['ExitCode'] -eq 125) 'Native exit code lost'
  }
  $failureLog = Get-Content (Join-Path $shop 'launcher.log') -Raw
  Assert ($failureLog -match 'ENGINE_INIT_FAILED EXIT_125 REASON_NETWORK') 'Safe diagnostic missing'
  Assert ($failureLog -notmatch 'private-marker|https:') 'Native output leaked into diagnostic log'
  Assert ($failureLog -match 'ENGINE_DETAIL connection reset by peer') 'Safe underlying bootstrap error was lost'
  Assert ($failureLog -notmatch 'private-credential') 'Credential-bearing diagnostic line leaked'
  $script:ShopDirectory = $null

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

  # A transient first download failure must be recovered by bootstrap itself, not a manual machine init.
  $script:creationAttempts = 0
  $script:createdMachine = $false
  $script:startedMachine = $false
  $script:faultMode = 'transient'
  function Start-Sleep { }
  function Invoke-ShopPodman {
    $command = $args -join ' '
    if ($command -eq 'machine list --format json') {
      if ($script:createdMachine) { '[{"Name":"tillumipos"}]' } else { '[]' }
    } elseif ($command -eq 'machine init --rootful tillumipos') {
      $script:creationAttempts++
      if ($script:creationAttempts -eq 1 -or $script:faultMode -in @('permanent', 'exhausted')) {
        if ($script:faultMode -eq 'partial') { $script:createdMachine = $true }
        $failure = New-Object InvalidOperationException('ENGINE_COMMAND_FAILED')
        $failure.Data['Diagnostic'] = if ($script:faultMode -eq 'permanent') { 'permission denied' } else { 'connection reset by peer' }
        throw $failure
      }
      $script:createdMachine = $true
    } elseif ($command -eq 'machine inspect tillumipos') { '[{"Rootful":true,"State":"stopped"}]' }
    elseif ($command -eq 'machine start tillumipos') { $script:startedMachine = $true }
  }
  & $engineImplementation $engineProgram
  Assert ($script:creationAttempts -eq 2 -and $script:startedMachine) 'Transient bootstrap failed to recover itself'
  foreach ($mode in @('partial', 'permanent', 'exhausted')) {
    $script:creationAttempts = 0; $script:createdMachine = $false; $script:startedMachine = $false; $script:faultMode = $mode
    if ($mode -eq 'partial') {
      & $engineImplementation $engineProgram
      Assert ($script:creationAttempts -eq 1 -and $script:startedMachine) 'Registered machine was initialized twice instead of resumed'
    } else {
      Must-Fail { & $engineImplementation $engineProgram } "Bootstrap accepted $mode failure"
      $expectedAttempts = if ($mode -eq 'permanent') { 1 } else { 3 }
      Assert ($script:creationAttempts -eq $expectedAttempts -and -not $script:startedMachine) "Unbounded or inappropriate retries for $mode"
    }
  }
  Remove-Item Function:\Start-Sleep

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

  # The real worker must retain the init phase/reason across a rethrow and JSON boundary.
  $workerShop = Join-Path $testRoot 'failed-bootstrap'
  Initialize-ShopSettings $workerShop
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start(); $freePort = $listener.LocalEndpoint.Port; $listener.Stop()
  (Get-Content (Join-Path $workerShop '.env')) -replace '^PORT=3000$', "PORT=$freePort" | Set-Content (Join-Path $workerShop '.env') -Encoding ASCII
  $nativeBody = @'
@echo off
if "%1"=="machine" if "%2"=="list" (
echo []
exit /b 0
)
echo Error: permission denied
exit /b 125
'@
  [IO.File]::WriteAllText($fakeCommand, $nativeBody.Replace("`n", "`r`n"), [Text.Encoding]::ASCII)
  New-Item -ItemType Directory (Join-Path $program 'payload/scripts') -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $program 'payload/scripts/podman-windows.ps1'), ("function Find-Podman { '" + $fakeCommand.Replace("'", "''") + "' }"))
  $failedOutput = & powershell -NoProfile -File "$PSScriptRoot/worker.ps1" -Action Start -ProgramDirectory $program -ShopDirectory $workerShop
  $failedReply = $failedOutput | ConvertFrom-Json
  Assert (-not $failedReply.Ok -and $failedReply.Code -eq 'ENGINE_INIT_FAILED' -and $failedReply.Reason -eq 'PERMISSION') 'Worker discarded the underlying bootstrap phase/reason'
  Write-Host 'PASS: settings, payload validation, backup failure, health failure, update order, idempotent startup'
} finally {
  # This path is a newly generated test directory; never the installed shop.
  if ($testRoot.StartsWith([IO.Path]::GetTempPath()) -and (Split-Path $testRoot -Leaf) -like 'tillumipos-test-*') {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
