# Shared by install.ps1. Dot-source it, then call Show-LanAddress:
#   . "$PSScriptRoot\lan-address.ps1"
#   Show-LanAddress $port
# Prints the address an iPad, phone or second till on the same Wi-Fi types to reach this computer, opens the
# Windows firewall for it when the script runs as administrator, and checks that the system answers there.

# The IPv4 address of the network card that carries the default route (the Wi-Fi or cable to the router).
function Get-LanAddress {
  $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
  if (-not $route) { return $null }
  Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1 -ExpandProperty IPAddress
}

function Test-Administrator {
  ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Windows blocks other computers from reaching a port until a rule allows it. Only private and domain
# networks are opened: a shop's Wi-Fi marked "public" stays closed until its owner marks it private.
function Open-LanFirewall([string]$Port) {
  $name = "TillumiPOS (TCP $Port)"
  if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) { return $true }
  if (-not (Test-Administrator)) { return $false }
  New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private, Domain | Out-Null
  return $true
}

function Show-LanAddress([string]$Port) {
  $ip = Get-LanAddress
  if (-not $ip) {
    Write-Host "Could not find this computer's network address. Connect to Wi-Fi or a network cable, then run ipconfig and read the IPv4 address."
    return
  }
  Write-Host "Other devices on the same Wi-Fi (iPad, phone): http://${ip}:$Port"

  if (-not (Open-LanFirewall $Port)) {
    Write-Warning "Windows may block other devices. Run this once in PowerShell as administrator:`n  New-NetFirewallRule -DisplayName 'TillumiPOS (TCP $Port)' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private,Domain"
  }
  $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1
  $profile = if ($route) { Get-NetConnectionProfile -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue }
  if ($profile -and $profile.NetworkCategory -eq 'Public') {
    Write-Warning "This network is marked Public, so Windows keeps other devices out. Mark it Private: Settings > Network & internet > Wi-Fi > this network > Network profile type: Private."
  }

  # This request goes out through the same address another device would use, so it fails when the system only
  # listens on this computer. It cannot see a firewall that blocks other computers.
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://${ip}:$Port/api/v1/health" | Out-Null }
  catch { Write-Warning 'The system did not answer on that address. Other devices will not reach it until this is fixed (see docs/install.md, section "เชื่อมต่อเครื่องอื่น").' }
}
