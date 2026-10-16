# Shared by install.ps1, backup.ps1 and restore.ps1. Dot-source it, then call Initialize-Podman:
#   . "$PSScriptRoot\podman-windows.ps1"
#   Initialize-Podman
#   compose -f docker-compose.yml up -d
#
# It finds Podman (installing it with winget if missing), makes sure its machine exists, is running and is rootful
# (ports 80 and 443 need that), and makes `podman compose` use a standalone Docker Compose rather than the one
# Docker Desktop installs. Registry pulls for the build are anonymous, so Docker Desktop's credential helper is
# not used. Everything is set for this process only: the user's environment and Docker Desktop are not changed.

$script:Podman = $null

function Find-Podman {
  $found = @((Get-Command podman -ErrorAction SilentlyContinue).Source, 'C:\Program Files\RedHat\Podman\podman.exe') |
    Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  return $found
}

function Find-StandaloneCompose {
  # Docker Desktop's own copy lives under Docker\Docker\resources; anything else installed by winget is standalone.
  Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter 'docker-compose.exe' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch 'Docker\\Docker\\resources' } | Select-Object -First 1
}

function Initialize-Podman {
  $script:Podman = Find-Podman
  if (-not $script:Podman) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      Write-Error 'Podman is not installed. Install Podman Desktop first: https://podman.io/getting-started/installation'
    }
    Write-Host 'Installing Podman (winget RedHat.Podman)...'
    winget install --id RedHat.Podman -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
    $script:Podman = Find-Podman
    if (-not $script:Podman) {
      Write-Error 'Podman was installed but cannot be found. Open a new terminal and run this script again.'
    }
  }

  Initialize-PodmanMachine
  Set-ComposeProvider
  Use-AnonymousRegistryPulls
}

function Initialize-PodmanMachine {
  $list = @(& $script:Podman machine list --format json 2>$null | ConvertFrom-Json)
  if ($list.Count -eq 0) {
    Write-Host 'Creating the Podman machine (first time only: downloads about 1 GB)...'
    & $script:Podman machine init | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error 'The Podman machine could not be created.' }
  }

  $machine = @(& $script:Podman machine inspect 2>$null | ConvertFrom-Json) | Select-Object -First 1
  if (-not $machine.Rootful) {
    # `machine set --rootful` only works on a stopped machine.
    if ($machine.State -eq 'running') { & $script:Podman machine stop | Out-Null }
    & $script:Podman machine set --rootful | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error 'The Podman machine could not be made rootful.' }
  }

  if ((@(& $script:Podman machine inspect 2>$null | ConvertFrom-Json) | Select-Object -First 1).State -ne 'running') {
    Write-Host 'Starting the Podman machine...'
    & $script:Podman machine start | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error 'The Podman machine could not be started. Try: podman machine start' }
  }
}

function Set-ComposeProvider {
  # Podman prints a notice on stderr every time it uses an external provider. Scripts that read output with
  # `2>$null` would turn that notice into an error, so it is switched off here.
  $env:PODMAN_COMPOSE_WARNING_LOGS = 'false'
  if ($env:PODMAN_COMPOSE_PROVIDER) { return }
  $standalone = Find-StandaloneCompose
  if (-not $standalone) {
    Write-Host 'Installing Docker Compose (winget Docker.DockerCompose)...'
    winget install --id Docker.DockerCompose -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
    $standalone = Find-StandaloneCompose
  }
  if (-not $standalone) { Write-Error 'Docker Compose could not be found. Install it: winget install Docker.DockerCompose' }
  $env:PODMAN_COMPOSE_PROVIDER = $standalone.FullName
}

function Use-AnonymousRegistryPulls {
  $dir = Join-Path $env:TEMP 'pos-podman-config'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Set-Content -Path (Join-Path $dir 'config.json') -Value '{}' -Encoding ascii
  $env:DOCKER_CONFIG = $dir
}

function compose {
  & $script:Podman compose @args
}
