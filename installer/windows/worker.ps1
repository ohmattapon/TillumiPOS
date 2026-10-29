param(
  [ValidateSet('Start', 'Backup', 'Stop')][string]$Action = 'Start',
  [string]$ProgramDirectory = $PSScriptRoot,
  [string]$ShopDirectory = (Join-Path $env:LOCALAPPDATA 'TillumiPOS/shop'),
  [ValidateLength(1,30)][ValidatePattern('^tillumipos(?:-[a-z0-9-]+)?$')][string]$MachineName = 'tillumipos'
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/runtime.ps1"
New-Item -ItemType Directory -Force $ShopDirectory | Out-Null
$lock = $null
try {
  $lock = [IO.File]::Open((Join-Path $ShopDirectory 'operation.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
  if ($Action -eq 'Start') { $result = Start-InstalledShop $ProgramDirectory $ShopDirectory $MachineName }
  elseif ($Action -eq 'Backup') {
    $script:ShopDirectory = $ShopDirectory
    Initialize-InstallerEngine $ProgramDirectory $MachineName
    # Stop app traffic for a consistent database + media snapshot.
    Invoke-ShopCompose stop app | Out-Null
    try { $directory = Invoke-ShopBackup $ShopDirectory }
    finally { Invoke-ShopCompose start app | Out-Null }
    $result = @{ BackupDirectory = $directory }
  } else {
    . (Join-Path $ProgramDirectory 'payload/scripts/podman-windows.ps1')
    $script:Podman = Find-Podman
    $script:ShopDirectory = $ShopDirectory
    Use-ShopConnection $MachineName
    if ($script:Podman -and (Test-Path (Join-Path $ShopDirectory 'docker-compose.yml'))) {
      $machine = @(Invoke-ShopPodman machine inspect $MachineName | Out-String | ConvertFrom-Json) | Select-Object -First 1
      if ($machine.State -eq 'running') {
        Set-ComposeProvider
        Invoke-ShopCompose stop | Out-Null
        Invoke-ShopPodman machine stop $MachineName | Out-Null
      }
    }
    Write-InstallerStatus $ShopDirectory 'STOPPED'
    $result = @{}
  }
  @{ Ok = $true; Result = $result } | ConvertTo-Json -Compress
} catch {
  $known = @('INVALID_PORT', 'INVALID_PAYLOAD', 'PORT_IN_USE', 'INCOMPLETE_INSTALL', 'DOWNGRADE_BLOCKED', 'VERSION_REUSED', 'BACKUP_FAILED', 'HEALTH_FAILED', 'ENGINE_COMMAND_FAILED', 'ENGINE_INIT_FAILED', 'ENGINE_START_FAILED', 'ENGINE_INSPECT_FAILED', 'ENGINE_STOP_FAILED', 'COMPOSE_COMMAND_FAILED', 'PREREQUISITE_MISSING', 'ENGINE_CONFLICT')
  $code = if (-not $lock) { 'OPERATION_BUSY' } elseif ($known -contains $_.Exception.Message) { $_.Exception.Message } else { 'START_FAILED' }
  Write-InstallerStatus $ShopDirectory $code
  @{ Ok = $false; Code = $code; Reason = [string]$_.Exception.Data['Reason'] } | ConvertTo-Json -Compress
  exit 1
} finally { if ($lock) { $lock.Dispose() } }
