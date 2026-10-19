# Shared by install.ps1. Dot-source it, then call Show-LanAddress:
#   . "$PSScriptRoot\lan-address.ps1"
#   Show-LanAddress $port
# Prints the address an iPad, phone or second till on the same Wi-Fi types to reach this computer, then makes sure
# it can: asks the system through that address, and when run as administrator fixes what blocks it (the firewall,
# a Wi-Fi marked Public, and Podman on WSL listening on this computer only). Without administrator rights it
# changes nothing and says what to do. Keep this file ASCII: Windows PowerShell 5.1 reads a file without a BOM as ANSI.

# The IPv4 address of the network card that carries the default route (the Wi-Fi or cable to the router).
function Get-LanAddress {
  $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
  if (-not $route) { return $null }
  Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1 -ExpandProperty IPAddress
}

function Get-DefaultRouteInterfaceIndex {
  $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
  if ($route) { $route.InterfaceIndex }
}

function Test-Administrator {
  ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# A question can only be asked where someone can answer it.
function Test-Interactive {
  [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
}

# True when the system answers on the address another device would use. It cannot see a firewall that blocks
# other computers, because a computer is not filtered when it talks to its own address.
function Test-LanReachable([string]$Ip, [string]$Port) {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://${Ip}:$Port/api/v1/health" | Out-Null; $true }
  catch { $false }
}

# The addresses that `netsh interface portproxy show v4tov4` forwards to this computer's own port: rows of
#   Listen on ipv4:             Connect to ipv4:
#   Address         Port        Address         Port
#   192.168.1.34    3000        127.0.0.1       3000
function Get-ForwardedAddresses([string[]]$Lines, [string]$Port) {
  foreach ($line in $Lines) {
    if ($line -match "^\s*(\S+)\s+$Port\s+127\.0\.0\.1\s+$Port\s*$") { $Matches[1] }
  }
}

# Windows blocks other computers from reaching a port until a rule allows it. Only private and domain networks
# are opened, and only to computers on the same subnet: a shop's Wi-Fi marked Public stays closed until its owner
# marks it Private. Returns false when the rule cannot be made without administrator rights.
function Set-LanFirewall([string]$Port) {
  $name = "TillumiPOS (TCP $Port)"
  $exists = [bool](Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)
  if (-not (Test-Administrator)) { return $exists }
  if ($exists) { Set-NetFirewallRule -DisplayName $name -Profile Private, Domain -RemoteAddress LocalSubnet | Out-Null }
  else { New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private, Domain -RemoteAddress LocalSubnet | Out-Null }
  $true
}

# Podman on WSL can publish the port on this computer's localhost only (wslrelay), so other devices cannot connect
# even though the system runs. Forwarding this computer's address to its own localhost fixes that. A rule left over
# from an address this computer no longer has is removed first, so there is one rule, for the current address.
function Set-LanPortForward([string]$Ip, [string]$Port) {
  foreach ($old in @(Get-ForwardedAddresses @(netsh interface portproxy show v4tov4) $Port)) {
    netsh interface portproxy delete v4tov4 listenaddress=$old listenport=$Port | Out-Null
  }
  netsh interface portproxy add v4tov4 listenaddress=$Ip listenport=$Port connectaddress=127.0.0.1 connectport=$Port | Out-Null
}

function Show-LanAddress([string]$Port) {
  $ip = Get-LanAddress
  if (-not $ip) {
    Write-Host "Could not find this computer's network address. Connect to Wi-Fi or a network cable, then run ipconfig and read the IPv4 address."
    return
  }
  Write-Host "Other devices on the same Wi-Fi (iPad, phone): http://${ip}:$Port"

  $admin = Test-Administrator
  $rerun = 'Run install.ps1 again from a PowerShell opened as administrator (right-click, Run as administrator) and it will set this up.'

  if (-not (Set-LanFirewall $Port)) {
    Write-Warning "Windows may block other devices. $rerun"
  }

  $index = Get-DefaultRouteInterfaceIndex
  $netProfile = if ($index) { Get-NetConnectionProfile -InterfaceIndex $index -ErrorAction SilentlyContinue }
  if ($netProfile -and $netProfile.NetworkCategory -eq 'Public') {
    # Marking a network Private is a security decision about this computer, so it is only ever done on a yes.
    $answer = if ($admin -and (Test-Interactive)) { Read-Host 'This network is marked Public, so Windows keeps other devices out. Mark it Private (only do this on your own shop network)? [y/N]' }
    if ($answer -match '^(y|yes)$') {
      Set-NetConnectionProfile -InterfaceIndex $index -NetworkCategory Private
      Write-Host 'The network is now Private.'
    } else {
      Write-Warning 'This network is marked Public, so Windows keeps other devices out. Mark it Private: Settings > Network & internet > Wi-Fi > this network > Network profile type: Private.'
    }
  }

  if (Test-LanReachable $ip $Port) { return }
  if (-not $admin) {
    Write-Warning "The system did not answer on that address, so other devices will not reach it. $rerun"
    return
  }
  Set-LanPortForward $ip $Port
  if (Test-LanReachable $ip $Port) {
    Write-Host "Forwarding ${ip}:$Port to this computer is set up. If the router gives this computer a new address, run install.ps1 again (or reserve the address in the router, see docs/install.md)."
  } else {
    Write-Warning 'The system still did not answer on that address after forwarding it. Other devices will not reach it (see docs/install.md, the section about connecting other devices).'
  }
}
