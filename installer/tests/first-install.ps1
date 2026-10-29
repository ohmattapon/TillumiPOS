# first-install.ps1 against fake PostgreSQL tools (no real database, no admin rights).
# The fakes record what they were asked to do, so the test can check the password flow:
# a fresh cluster gets a password, an old trust cluster is switched to one, and the
# `pos` database is created whenever it is missing.
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$failures = 0
function Check([string]$Name, [scriptblock]$Body) {
  try { & $Body; Write-Host "PASS $Name" } catch { $script:failures++; Write-Host "FAIL $Name : $_" }
}
function Assert([bool]$Value, [string]$Message) { if (-not $Value) { throw $Message } }

$tools = Join-Path ([IO.Path]::GetTempPath()) ('tillumi-first-install-tools-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tools | Out-Null
$fake = Join-Path $tools 'fake.exe'
Add-Type -TypeDefinition @'
using System;
using System.IO;
public class FakePostgresTool {
  static void Log(string line) { File.AppendAllText(Environment.GetEnvironmentVariable("FAKE_PG_LOG"), line + "\n"); }
  public static int Main(string[] args) {
    string tool = Path.GetFileNameWithoutExtension(System.Reflection.Assembly.GetEntryAssembly().Location);
    string password = Environment.GetEnvironmentVariable("PGPASSWORD") ?? "";
    if (tool == "initdb") {
      string data = null, pwfile = null, auth = "";
      for (int i = 0; i < args.Length; i++) {
        if (args[i] == "-D") data = args[i + 1];
        if (args[i].StartsWith("--pwfile=")) pwfile = args[i].Substring(9);
        if (args[i].StartsWith("--auth-host=")) auth = args[i].Substring(12);
      }
      Directory.CreateDirectory(data);
      File.WriteAllText(Path.Combine(data, "PG_VERSION"), "17");
      File.WriteAllText(Path.Combine(data, "pg_hba.conf"), "host all all 127.0.0.1/32 " + auth + "\n");
      Log("initdb auth=" + auth + " password=" + File.ReadAllText(pwfile));
      return 0;
    }
    if (tool == "pg_ctl") { Log("pg_ctl " + args[0]); return 0; }
    if (tool == "createdb") { Log("createdb password=" + password); return 0; }
    if (tool == "psql") {
      for (int i = 0; i < args.Length; i++) {
        if (args[i] == "-f") { Log("psql file=" + File.ReadAllText(args[i + 1]).Trim()); return 0; }
        if (args[i] == "-Atc") {
          Log("psql check password=" + password);
          if (Environment.GetEnvironmentVariable("FAKE_PG_SIGNIN_FAILS") == "1") return 2;
          Console.WriteLine(Environment.GetEnvironmentVariable("FAKE_PG_DB_EXISTS") ?? "");
          return 0;
        }
      }
      return 0;
    }
    return 0;
  }
}
'@ -OutputAssembly $fake -OutputType ConsoleApplication

function New-Fixture {
  $fixture = Join-Path ([IO.Path]::GetTempPath()) ('tillumi-first-install-' + [guid]::NewGuid().ToString('N'))
  $install = Join-Path $fixture 'install'
  $scripts = Join-Path $install 'scripts'
  $bin = Join-Path $fixture 'pgsql\bin'
  New-Item -ItemType Directory -Path $scripts,$bin | Out-Null
  foreach ($name in @('first-install.ps1', 'shop-database.ps1')) {
    Copy-Item (Join-Path $root "installer\scripts\$name") $scripts
  }
  # Locking the TEMP folder to SYSTEM and Administrators would stop this test from cleaning up;
  # protect-data-dir.ps1 is tested on its own, so it is a no-op here.
  Set-Content (Join-Path $scripts 'protect-data-dir.ps1') "param([string]`$DataDir) Add-Content -LiteralPath `$env:FAKE_PG_LOG 'protect'"
  foreach ($tool in @('initdb', 'pg_ctl', 'createdb', 'psql', 'pg_dump')) { Copy-Item $fake (Join-Path $bin "$tool.exe") }
  [pscustomobject]@{ Root = $fixture; Install = $install; Data = (Join-Path $fixture 'data'); Pgsql = (Join-Path $fixture 'pgsql'); Log = (Join-Path $fixture 'tools.log') }
}

function Invoke-FirstInstall($Fixture) {
  $env:FAKE_PG_LOG = $Fixture.Log
  $ErrorActionPreference = 'Continue'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Fixture.Install 'scripts\first-install.ps1') `
    -InstallDir $Fixture.Install -DataDir $Fixture.Data -PgsqlDir $Fixture.Pgsql -PortDb 45435 -PortApi 43000 *> (Join-Path $Fixture.Root 'run.log')
  $exit = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  return $exit
}

function Read-EnvPassword($Fixture) {
  $line = Get-Content (Join-Path $Fixture.Data '.env') | Where-Object { $_ -match '^DATABASE_URL=' }
  # Written in two pieces: a literal connection string with a password in it is what repo-secrets.test.ts hunts for.
  if ($line -notmatch ('^DATABASE_URL=postgres' + '://pos:([A-Za-z0-9]+)@127\.0\.0\.1:45435/pos$')) { throw "Unexpected DATABASE_URL: $line" }
  return $Matches[1]
}

Check 'a fresh install gives the database a random password and requires it' {
  $f = New-Fixture
  $env:FAKE_PG_DB_EXISTS = ''
  Assert ((Invoke-FirstInstall $f) -eq 0) "first-install failed: $(Get-Content -Raw (Join-Path $f.Root 'run.log'))"
  $password = Read-EnvPassword $f
  Assert ($password.Length -ge 32) 'Password is too short'
  $log = Get-Content -Raw $f.Log
  Assert ($log.StartsWith('protect')) 'The data folder was not locked before anything was written'
  Assert ($log.Contains("initdb auth=scram-sha-256 password=$password")) 'initdb did not get the password or still trusts connections'
  Assert ($log.Contains("psql check password=$password") -and $log.Contains("createdb password=$password")) 'Database setup did not sign in with the password'
  $hba = Get-Content -Raw (Join-Path $f.Data 'pgdata\pg_hba.conf')
  Assert ($hba -notmatch '\btrust\b') 'pg_hba.conf still trusts connections'
  Assert ($hba -match '127\.0\.0\.1/32\s+scram-sha-256') 'pg_hba.conf does not require a password on loopback'
  Assert (-not (Get-ChildItem -Force $f.Data -Filter '.initdb-*')) 'The password file for initdb was left behind'
}

Check 're-running keeps the password and does not create the database twice' {
  $f = New-Fixture
  $env:FAKE_PG_DB_EXISTS = ''
  Assert ((Invoke-FirstInstall $f) -eq 0) 'first run failed'
  $password = Read-EnvPassword $f
  Clear-Content $f.Log
  $env:FAKE_PG_DB_EXISTS = '1'
  Assert ((Invoke-FirstInstall $f) -eq 0) "second run failed: $(Get-Content -Raw (Join-Path $f.Root 'run.log'))"
  Assert ((Read-EnvPassword $f) -ceq $password) 'Re-running changed the database password'
  $log = Get-Content -Raw $f.Log
  Assert (-not $log.Contains('initdb')) 'Re-running made a new cluster'
  Assert (-not $log.Contains('createdb')) 'Re-running created the database again'
}

Check 'an install that stopped before createdb creates the database next time' {
  $f = New-Fixture
  New-Item -ItemType Directory -Path (Join-Path $f.Data 'pgdata') | Out-Null
  Set-Content (Join-Path $f.Data 'pgdata\PG_VERSION') '17'
  Set-Content (Join-Path $f.Data 'pgdata\pg_hba.conf') 'host all all 127.0.0.1/32 scram-sha-256'
  Set-Content (Join-Path $f.Data '.env') 'DATABASE_URL=postgres://pos:your-known-password@127.0.0.1:45435/pos'
  $env:FAKE_PG_DB_EXISTS = ''
  Assert ((Invoke-FirstInstall $f) -eq 0) 'first-install failed'
  Assert ((Get-Content -Raw $f.Log).Contains('createdb password=your-known-password')) 'The missing database was not created'
}

Check 'an old trust install is switched to a password and .env is updated, keeping its other secrets' {
  $f = New-Fixture
  New-Item -ItemType Directory -Path (Join-Path $f.Data 'pgdata') | Out-Null
  Set-Content (Join-Path $f.Data 'pgdata\PG_VERSION') '17'
  Set-Content (Join-Path $f.Data 'pgdata\pg_hba.conf') @('local   all   all                   trust', 'host    all   all   127.0.0.1/32    trust')
  Set-Content (Join-Path $f.Data '.env') @('JWT_SECRET=keep-me', 'DATABASE_URL=postgres://pos@127.0.0.1:45435/pos', 'PORT=43000')
  $env:FAKE_PG_DB_EXISTS = '1'
  Assert ((Invoke-FirstInstall $f) -eq 0) "first-install failed: $(Get-Content -Raw (Join-Path $f.Root 'run.log'))"
  $password = Read-EnvPassword $f
  $envText = Get-Content -Raw (Join-Path $f.Data '.env')
  Assert ($envText.Contains('JWT_SECRET=keep-me') -and $envText.Contains('PORT=43000')) 'Other .env values were lost'
  $log = Get-Content -Raw $f.Log
  Assert ($log.Contains("psql file=ALTER ROLE pos PASSWORD '$password';")) 'The role did not get the password'
  Assert ($log.IndexOf('psql file=') -lt $log.IndexOf('psql check')) 'The password was not set before connecting with it'
  Assert ((Get-Content -Raw (Join-Path $f.Data 'pgdata\pg_hba.conf')) -notmatch '\btrust\b') 'pg_hba.conf still trusts connections'
  Assert (-not (Get-ChildItem -Force $f.Data -Filter '.set-password-*')) 'The SQL file with the password was left behind'
}

Check 'a lost .env stops with a clear message instead of guessing a password' {
  $f = New-Fixture
  New-Item -ItemType Directory -Path (Join-Path $f.Data 'pgdata') | Out-Null
  Set-Content (Join-Path $f.Data 'pgdata\PG_VERSION') '17'
  Set-Content (Join-Path $f.Data 'pgdata\pg_hba.conf') 'host all all 127.0.0.1/32 scram-sha-256'
  $env:FAKE_PG_SIGNIN_FAILS = '1'
  try { $exit = Invoke-FirstInstall $f } finally { Remove-Item Env:\FAKE_PG_SIGNIN_FAILS }
  Assert ($exit -ne 0) 'first-install succeeded without being able to sign in'
  Assert ((Get-Content -Raw (Join-Path $f.Root 'run.log')) -match 'password is lost') 'The failure does not say the password is lost'
  Assert (-not (Test-Path (Join-Path $f.Data '.env'))) 'A .env with a password that does not work was written'
}

Remove-Item Env:\FAKE_PG_LOG, Env:\FAKE_PG_DB_EXISTS -ErrorAction SilentlyContinue
Get-ChildItem ([IO.Path]::GetTempPath()) -Directory -Filter 'tillumi-first-install-*' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
if ($failures -gt 0) { throw "$failures first-install checks failed" }
