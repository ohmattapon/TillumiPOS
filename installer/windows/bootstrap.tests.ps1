param(
  [Parameter(Mandatory = $true)][string]$ProgramDirectory,
  [string]$MachineName = ('tillumipos-boot-test-' + [guid]::NewGuid().ToString('N').Substring(0, 8)),
  [switch]$EngineOnly
)
# Opt-in native integration test. No mock engine and no machine created before the application bootstrap.
$ErrorActionPreference = 'Stop'
if ($MachineName -notmatch '^tillumipos-boot-test-[a-z0-9-]+$') { throw 'Only a fresh disposable bootstrap machine is allowed' }
. "$PSScriptRoot/runtime.ps1"
$script:ShopDirectory = Join-Path ([IO.Path]::GetTempPath()) $MachineName
New-Item -ItemType Directory $script:ShopDirectory -Force | Out-Null
$podman = (Get-Command podman -ErrorAction Stop).Source
$before = @(& $podman machine list --format json | Out-String | ConvertFrom-Json)
if ($before | Where-Object { $_.Name -eq $MachineName }) { throw 'Machine must not exist before the test' }
try {
  if ($EngineOnly) { Initialize-InstallerEngine $ProgramDirectory $MachineName }
  else {
    Initialize-ShopSettings $script:ShopDirectory
    $envFile = Join-Path $script:ShopDirectory '.env'
    (Get-Content $envFile) -replace '^PORT=3000$', 'PORT=13073' | Set-Content $envFile -Encoding ASCII
    $worker = Join-Path $ProgramDirectory 'worker.ps1'
    $output = & "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $worker -Action Start -ShopDirectory $script:ShopDirectory -MachineName $MachineName
    $exitCode = $LASTEXITCODE
    $reply = ($output | Where-Object { $_ -match '^\{"' } | Select-Object -Last 1) | ConvertFrom-Json
    if ($exitCode -ne 0 -or -not $reply.Ok) { throw "Packaged worker failed: $($reply.Code) reason=$($reply.Reason)" }
    if ($reply.Result.Port -ne 13073 -or -not $reply.Result.SetupCode) { throw 'Worker did not reach first-run setup' }
    if (-not (Test-ShopHealth 13073)) { throw 'Packaged worker did not serve healthy HTTP' }
    $script:Podman = $podman
    Use-ShopConnection $MachineName
    Write-Host 'PASS: packaged worker created the VM, loaded its bundled image, started PostgreSQL/Redis/app and served HTTP setup without a manual machine init/start'
  }
  $info = Invoke-ShopPodman info --format json | Out-String | ConvertFrom-Json
  if (-not $info.host) { throw 'No working engine after application bootstrap' }
  Write-Host "PASS: native PowerShell bootstrap created and started $MachineName with no pre-created machine"
} catch {
  Write-Host "FAIL: $($_.Exception.Message) exit=$($_.Exception.Data['ExitCode'])"
  # Only bootstrap diagnostics, with endpoint URLs removed. Never app logs, .env, keys or setup codes.
  Write-Host ([regex]::Replace([string]$_.Exception.Data['Diagnostic'], 'https?://\S+', '<download endpoint>'))
  throw
} finally {
  $after = @(& $podman machine list --format json | Out-String | ConvertFrom-Json)
  if ($after | Where-Object { $_.Name -eq $MachineName -and $_.Running }) {
    if (-not $EngineOnly -and (Test-Path (Join-Path $script:ShopDirectory 'docker-compose.yml'))) {
      $worker = Join-Path $ProgramDirectory 'worker.ps1'
      $stopOutput = & "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $worker -Action Stop -ShopDirectory $script:ShopDirectory -MachineName $MachineName
      if ($LASTEXITCODE -ne 0) { throw 'Packaged Stop worker failed during test cleanup' }
      Write-Host 'PASS: packaged Stop worker stopped its own stack and machine'
    } else { & $podman machine stop $MachineName | Out-Null }
  }
}
