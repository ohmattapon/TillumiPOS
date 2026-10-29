# Real filesystem, archive and executable boundaries; service control is faked.
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('tillumi-native-runners-' + [guid]::NewGuid().ToString('N'))
$appDir = Join-Path $fixture 'app with spaces'
$dataDir = Join-Path $fixture 'shop with spaces'
$bin = Join-Path $fixture 'bin'
New-Item -ItemType Directory -Path $appDir,$dataDir,$bin | Out-Null
$fake = Join-Path $bin 'psql.exe'
Add-Type -TypeDefinition @'
using System;
using System.IO;
public class NativeRunnerFixture {
  public static int Main() {
    string events = Environment.GetEnvironmentVariable("NATIVE_TEST_EVENTS");
    if (!String.IsNullOrEmpty(events)) File.AppendAllText(events, "sql\n");
    string passwordLog = Environment.GetEnvironmentVariable("NATIVE_TEST_PASSWORD_LOG");
    if (!String.IsNullOrEmpty(passwordLog)) File.WriteAllText(passwordLog, Environment.GetEnvironmentVariable("PGPASSWORD") ?? "");
    Console.WriteLine(Environment.GetEnvironmentVariable("MIGRATIONS_DIR"));
    Console.WriteLine(Environment.GetEnvironmentVariable("DATABASE_URL"));
    Console.WriteLine(Environment.CurrentDirectory);
    return Environment.GetEnvironmentVariable("NATIVE_TEST_FAIL") == "1" ? 1 : 0;
  }
}
'@ -OutputAssembly $fake -OutputType ConsoleApplication
Copy-Item -LiteralPath $fake -Destination (Join-Path $appDir 'tillumi-migrate.exe')
# The shop's connection, password included, lives only in .env (first-install.ps1 writes it).
$shopUrl = 'postgres://pos:your-test-password@127.0.0.1:15435/pos'
Set-Content -LiteralPath (Join-Path $dataDir '.env') -Value @('JWT_SECRET=x', "DATABASE_URL=$shopUrl")
$oldMigrations = $env:MIGRATIONS_DIR
$oldDatabase = $env:DATABASE_URL
$oldLocation = (Get-Location).Path
try {
  $env:MIGRATIONS_DIR = 'original-migrations'
  $env:DATABASE_URL = 'original-database'
  $result = & (Join-Path $root 'installer\scripts\migrate-native.ps1') -AppDir $appDir -DataDir $dataDir -PortDb 15435
  if ($result[0] -cne (Join-Path $appDir 'drizzle')) { throw 'Migration path changed or has trailing spaces' }
  if ($result[1] -cne $shopUrl) { throw 'Migration did not use DATABASE_URL from .env' }
  if ($result[2] -cne $dataDir) { throw 'Wrong migration working directory' }
  if ($env:MIGRATIONS_DIR -ne 'original-migrations' -or $env:DATABASE_URL -ne 'original-database' -or (Get-Location).Path -ne $oldLocation) { throw 'Migration leaked environment or working directory' }
  $env:NATIVE_TEST_FAIL = '1'
  $failed = $false
  try { & (Join-Path $root 'installer\scripts\migrate-native.ps1') -AppDir $appDir -DataDir $dataDir -PortDb 15435 | Out-Null } catch { $failed = $true }
  if (-not $failed -or $env:DATABASE_URL -ne 'original-database') { throw 'Migration failure was swallowed or leaked environment' }
  Remove-Item Env:\NATIVE_TEST_FAIL -ErrorAction SilentlyContinue
  Move-Item -LiteralPath (Join-Path $dataDir '.env') -Destination (Join-Path $fixture 'saved.env')
  $failed = $false
  try { & (Join-Path $root 'installer\scripts\migrate-native.ps1') -AppDir $appDir -DataDir $dataDir | Out-Null } catch { $failed = $true }
  Move-Item -LiteralPath (Join-Path $fixture 'saved.env') -Destination (Join-Path $dataDir '.env')
  if (-not $failed) { throw 'Migration ran without a DATABASE_URL in .env' }
  Write-Host 'PASS migration runner uses .env, preserves spaces, propagates failure, restores environment and directory'
} finally {
  $env:MIGRATIONS_DIR = $oldMigrations
  $env:DATABASE_URL = $oldDatabase
  Remove-Item Env:\NATIVE_TEST_FAIL -ErrorAction SilentlyContinue
}

$sql = Join-Path $fixture 'shop.sql.gz'
$file = [IO.File]::Create($sql)
$gzip = New-Object IO.Compression.GzipStream($file, [IO.Compression.CompressionMode]::Compress)
$writer = New-Object IO.StreamWriter($gzip)
$writer.WriteLine('-- PostgreSQL database dump complete')
$writer.Close()
$images = Join-Path $fixture 'saved-images'
$media = Join-Path $dataDir 'data\media'
New-Item -ItemType Directory -Path $images,$media | Out-Null
Set-Content (Join-Path $images 'restored.txt') 'saved image'
Set-Content (Join-Path $media 'old.txt') 'old image'
$archive = $sql -replace '\.sql\.gz$', '.media.tar.gz'
& tar.exe -czf $archive -C $images .
if ($LASTEXITCODE -ne 0) { throw 'Fixture archive creation failed' }
$events = Join-Path $fixture 'events.txt'
$env:NATIVE_TEST_EVENTS = $events
function Get-Service { param($Name) [pscustomobject]@{Status = 'Running'} }
function Stop-Service { param($Name) Add-Content $events 'stop' }
function Start-Service {
  param($Name)
  if (-not (Test-Path (Join-Path $media 'restored.txt'))) { throw 'Shop reopened before its images were restored' }
  Add-Content $events 'start'
}
try {
  $passwordLog = Join-Path $fixture 'pgpassword.txt'
  $env:NATIVE_TEST_PASSWORD_LOG = $passwordLog
  $env:PGPASSWORD = 'caller-value'
  & (Join-Path $root 'installer\scripts\restore-native.ps1') -File $sql -PgsqlBinDir $bin -DataDir $dataDir -Yes
  Remove-Item Env:\NATIVE_TEST_PASSWORD_LOG
  if ((Get-Content -Raw $passwordLog) -cne 'your-test-password') { throw 'Restore did not give psql the password from .env' }
  if ($env:PGPASSWORD -ne 'caller-value') { throw 'Restore leaked PGPASSWORD' }
  Remove-Item Env:\PGPASSWORD
  Write-Host 'PASS restore signs in with the password from .env and puts PGPASSWORD back'
  if (((Get-Content $events) -join ',') -ne 'stop,sql,start') { throw 'Restore service ordering is wrong' }
  if (Test-Path (Join-Path $media 'old.txt')) { throw 'Old images mixed with restored images' }
  $previous = Get-ChildItem $dataDir -Directory -Filter 'media-before-restore-*'
  if (-not (Test-Path (Join-Path $previous.FullName 'old.txt'))) { throw 'Previous images were discarded' }
  Write-Host 'PASS restore keeps shop stopped until images are ready and preserves previous images'
  $goodArchive = Join-Path $fixture 'good-media.tar.gz'
  Copy-Item $archive $goodArchive
  Clear-Content $events
  Set-Content $archive 'damaged archive'
  $failed = $false
  try { & (Join-Path $root 'installer\scripts\restore-native.ps1') -File $sql -PgsqlBinDir $bin -DataDir $dataDir -Yes } catch { $failed = $true }
  if (-not $failed -or (Get-Content $events)) { throw 'Damaged media touched the service or database' }
  Copy-Item $goodArchive $archive -Force
  $env:NATIVE_TEST_FAIL = '1'
  $failed = $false
  try { & (Join-Path $root 'installer\scripts\restore-native.ps1') -File $sql -PgsqlBinDir $bin -DataDir $dataDir -Yes } catch { $failed = $true }
  Remove-Item Env:\NATIVE_TEST_FAIL
  if (-not $failed -or ((Get-Content $events) -join ',') -ne 'stop,sql,start') { throw 'SQL failure did not reopen the unchanged shop' }
  Write-Host 'PASS damaged media changes nothing; failed SQL restore reopens unchanged shop'
  Clear-Content $events
  $realTar = (Get-Command tar.exe).Source
  function tar.exe {
    if ($args[0] -eq '-xzf') { $global:LASTEXITCODE = 1; return }
    & $realTar @args
  }
  $failed = $false
  try { & (Join-Path $root 'installer\scripts\restore-native.ps1') -File $sql -PgsqlBinDir $bin -DataDir $dataDir -Yes } catch { $failed = $true }
  if (-not $failed -or ((Get-Content $events) -join ',') -ne 'stop,sql') { throw 'Shop reopened after incomplete media restore' }
  if (-not (Test-Path (Join-Path $media 'restored.txt'))) { throw 'Failed extraction discarded current media' }
  Write-Host 'PASS failed media extraction preserves current images and leaves shop stopped'
} finally { Remove-Item Env:\NATIVE_TEST_EVENTS -ErrorAction SilentlyContinue }
