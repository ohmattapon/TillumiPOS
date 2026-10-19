# Avoid cmd.exe SET/quoting rules: paths with spaces must reach the compiled migrator unchanged.
param(
  [Parameter(Mandatory = $true)][string]$AppDir,
  [Parameter(Mandatory = $true)][string]$DataDir,
  [int]$PortDb = 5435
)
$ErrorActionPreference = 'Stop'
$previousMigrations = $env:MIGRATIONS_DIR
$previousDatabase = $env:DATABASE_URL
Push-Location -LiteralPath $DataDir
try {
  $env:MIGRATIONS_DIR = Join-Path $AppDir 'drizzle'
  $env:DATABASE_URL = "postgres://pos@127.0.0.1:$PortDb/pos"
  & (Join-Path $AppDir 'tillumi-migrate.exe')
  if ($LASTEXITCODE -ne 0) { throw "Database migration failed (exit $LASTEXITCODE)." }
} finally {
  $env:MIGRATIONS_DIR = $previousMigrations
  $env:DATABASE_URL = $previousDatabase
  Pop-Location
}
