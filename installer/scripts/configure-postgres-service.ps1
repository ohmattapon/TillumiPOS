# Run elevated by the installer, after service registration and before its first start.
# PostgreSQL refuses LocalSystem; LocalService needs explicit access to this shop's cluster.
param(
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [Parameter(Mandatory = $true)][string]$DataDir
)
$ErrorActionPreference = 'Stop'

# A failure here must reach the shop in words, not as an exit code (the installer runs hidden).
. (Join-Path $PSScriptRoot 'install-error.ps1')
Clear-InstallErrorLog $InstallDir
trap { Write-InstallErrorLog $InstallDir (Get-InstallErrorMessage $_); exit 1 }
$service = Get-CimInstance Win32_Service -Filter "Name='tillumi-postgres'" -ErrorAction Stop
if (-not $service) { throw 'PostgreSQL service registration is missing.' }
if ($service.State -ne 'Stopped') { throw 'Stop PostgreSQL before changing its service account.' }

# Numeric SID avoids localized account names in icacls. Grant no write access to
# application binaries; cluster and service logs are the only writable subtrees.
$grants = @(
  @{ Path = $InstallDir; Rights = '*S-1-5-19:(OI)(CI)RX'; Recursive = $true },
  @{ Path = $DataDir; Rights = '*S-1-5-19:RX'; Recursive = $false },
  @{ Path = (Join-Path $DataDir 'pgdata'); Rights = '*S-1-5-19:(OI)(CI)M'; Recursive = $true },
  @{ Path = (Join-Path $DataDir 'logs'); Rights = '*S-1-5-19:(OI)(CI)M'; Recursive = $true }
)
foreach ($grant in $grants) {
  if (-not (Test-Path -LiteralPath $grant.Path -PathType Container)) { throw "Required directory is missing: $($grant.Path)" }
  $arguments = @($grant.Path, '/grant', $grant.Rights)
  if ($grant.Recursive) { $arguments += '/T' }
  & icacls.exe @arguments | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Cannot grant PostgreSQL service access to $($grant.Path) (exit $LASTEXITCODE)." }
}

# Also repair existing registrations that older installers created as LocalSystem.
# CIM passes the empty password correctly on Windows PowerShell 5.1.
$result = Invoke-CimMethod -InputObject $service -MethodName Change -Arguments @{
  StartName = 'NT AUTHORITY\LocalService'
  StartPassword = ''
} -ErrorAction Stop
if ($result.ReturnValue -ne 0) { throw "Cannot configure PostgreSQL service account (code $($result.ReturnValue))." }
$actual = Get-CimInstance Win32_Service -Filter "Name='tillumi-postgres'" -ErrorAction Stop
if ($actual.StartName -ine 'NT AUTHORITY\LocalService') { throw 'PostgreSQL service account verification failed.' }
