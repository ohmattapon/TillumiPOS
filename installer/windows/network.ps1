param([ValidateRange(1024, 65535)][int]$Port = 3000, [switch]$TrustShopNetwork)
$ErrorActionPreference = 'Stop'
try {
  . "$PSScriptRoot/payload/scripts/lan-address.ps1"
  if (-not (Test-Administrator)) { exit 1 }
  $ip = Get-LanAddress
  if (-not $ip) { exit 2 }
  $index = Get-DefaultRouteInterfaceIndex
  $profile = Get-NetConnectionProfile -InterfaceIndex $index -ErrorAction Stop
  if ($profile.NetworkCategory -eq 'Public' -and $TrustShopNetwork) {
    Set-NetConnectionProfile -InterfaceIndex $index -NetworkCategory Private
  }
  Set-LanFirewall ([string]$Port) | Out-Null
  if (-not (Test-LanReachable $ip ([string]$Port))) {
    Set-LanPortForward $ip ([string]$Port)
  }
  if (-not (Test-LanReachable $ip ([string]$Port))) { exit 3 }
  exit 0
} catch { exit 1 }
