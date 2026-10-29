# Avoid cmd.exe SET/quoting rules: paths with spaces must reach the compiled migrator unchanged.
param(
  [Parameter(Mandatory = $true)][string]$AppDir,
  [Parameter(Mandatory = $true)][string]$DataDir,
  # Kept for callers that still pass it; the port now comes from DATABASE_URL in .env.
  [int]$PortDb = 5435
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'shop-database.ps1')
# The same connection (and password) the API uses: DATABASE_URL in <DataDir>\.env.
$databaseUrl = Read-ShopDatabaseUrl $DataDir
if ([string]::IsNullOrEmpty($databaseUrl)) { throw "DATABASE_URL not found in $DataDir\.env (run first-install.ps1 first)." }
$previousMigrations = $env:MIGRATIONS_DIR
$previousDatabase = $env:DATABASE_URL
Push-Location -LiteralPath $DataDir
try {
  $env:MIGRATIONS_DIR = Join-Path $AppDir 'drizzle'
  $env:DATABASE_URL = $databaseUrl
  & (Join-Path $AppDir 'tillumi-migrate.exe')
  if ($LASTEXITCODE -ne 0) { throw "Database migration failed (exit $LASTEXITCODE)." }
} finally {
  $env:MIGRATIONS_DIR = $previousMigrations
  $env:DATABASE_URL = $previousDatabase
  Pop-Location
}
