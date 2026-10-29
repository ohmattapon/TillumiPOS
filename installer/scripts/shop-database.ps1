# Dot-sourced by the native scripts that talk to the shop database. The connection, including its
# password, lives in one place: DATABASE_URL in <DataDir>\.env, written by first-install.ps1.

function Read-ShopDatabaseUrl([string]$DataDir) {
  $envFile = Join-Path $DataDir '.env'
  if (-not (Test-Path -LiteralPath $envFile)) { return $null }
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') { return $Matches[1] }
  }
  return $null
}

function Get-ShopDatabasePassword([string]$Url) {
  if ([string]::IsNullOrEmpty($Url)) { return '' }
  $userInfo = ([Uri]$Url).UserInfo
  if ($userInfo -notmatch ':') { return '' }
  return [Uri]::UnescapeDataString($userInfo.Substring($userInfo.IndexOf(':') + 1))
}

# Runs $Body with PGPASSWORD set for libpq tools (psql, pg_dump), then puts the environment back.
function Invoke-WithShopDatabasePassword([string]$DataDir, [scriptblock]$Body) {
  $previous = $env:PGPASSWORD
  try {
    $password = Get-ShopDatabasePassword (Read-ShopDatabaseUrl $DataDir)
    if ($password -ne '') { $env:PGPASSWORD = $password }
    & $Body
  } finally {
    $env:PGPASSWORD = $previous
  }
}
