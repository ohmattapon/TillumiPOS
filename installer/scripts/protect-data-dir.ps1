# Run elevated by first-install.ps1 on every install and update.
#
# ProgramData lets every Windows user read the folders under it (and create files in them),
# so the shop folder would otherwise expose .env (the JWT secret and database password),
# every backup and the service logs (which hold the first-run setup code) to anyone who
# signs in to this PC. This replaces that with: SYSTEM (the API service and the nightly
# backup) and Administrators, full control; nobody else. The PostgreSQL account is added
# back on pgdata and logs by configure-postgres-service.ps1, which runs after this.
param(
  [Parameter(Mandatory = $true)][string]$DataDir,
  # Test fixtures only: an extra account to keep, so a test run can clean its own TEMP folder.
  [string]$AlsoGrant = ''
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $DataDir -PathType Container)) { throw "Shop data folder not found: $DataDir" }
if ((Get-Item -LiteralPath $DataDir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
  throw "Refusing to change permissions through a junction or symbolic link: $DataDir"
}

# Numeric SIDs: account names are translated on Thai Windows. S-1-5-18 = SYSTEM, S-1-5-32-544 = Administrators.
$grants = @('*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F')
if ($AlsoGrant -ne '') { $grants += "${AlsoGrant}:(OI)(CI)F" }

$arguments = @($DataDir, '/inheritance:r')
foreach ($grant in $grants) { $arguments += @('/grant:r', $grant) }
& icacls.exe @arguments | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Cannot lock the shop data folder $DataDir (icacls exit $LASTEXITCODE)." }

# Files and folders made before this ran (an older install) still carry ACEs they inherited from
# ProgramData. Resetting them makes everything below inherit only the ACL set above.
& icacls.exe (Join-Path $DataDir '*') /reset /T /C /Q | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Cannot reset permissions below $DataDir (icacls exit $LASTEXITCODE)." }
