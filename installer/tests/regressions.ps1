# Run with Windows PowerShell 5.1; all mutable fixtures live in a disposable TEMP directory.
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$failures = 0
function Check([string]$Name, [scriptblock]$Body) {
  try { & $Body; Write-Host "PASS $Name" } catch { $script:failures++; Write-Host "FAIL $Name : $_" }
}
function Assert([bool]$Value, [string]$Message) { if (-not $Value) { throw $Message } }
$iss = Get-Content -Raw -LiteralPath (Join-Path $root 'installer\tillumi.iss')
Check 'PostgreSQL service runs unprivileged with prepared filesystem permissions' {
  [xml]$pgXml = Get-Content -Raw (Join-Path $root 'installer\winsw\tillumi-postgres.xml')
  Assert ($pgXml.service.serviceaccount.domain -eq 'NT AUTHORITY' -and $pgXml.service.serviceaccount.user -eq 'LocalService') 'PostgreSQL would run as LocalSystem and refuse to start'
  Assert ($iss.Contains('configure-postgres-service.ps1')) 'No ACL/account migration for existing installations'
  Assert ($iss.IndexOf('configure-postgres-service.ps1') -lt $iss.IndexOf("'สตาร์ทฐานข้อมูล'")) 'Service starts before permissions are prepared'
}
Check 'installer migrations avoid cmd SET trailing whitespace' {
  Assert ($iss -notmatch '/c "set MIGRATIONS_DIR=') 'Migration uses an unquoted cmd SET value'
  Assert ($iss.Contains('migrate-native.ps1')) 'Installer must use the migration runner'
}
Check 'reinstallation reuses existing services and preserves them on failure' {
  Assert ($iss.Contains('if not HadPostgresService then')) 'Database service installation is unconditional'
  Assert ($iss.Contains('if not HadApiService then')) 'API service installation is unconditional'
  $postInstall = $iss.Substring($iss.IndexOf('procedure CurStepChanged'))
  $failure = $postInstall.Substring($postInstall.IndexOf('  except'), $postInstall.IndexOf('procedure CurUninstallStepChanged') - $postInstall.IndexOf('  except'))
  Assert (-not $failure.Contains('StopAndRemoveServices();')) 'Install failure deletes existing services'
}
Check 'native setup code is accessible without Podman' {
  Assert ($iss.Contains('show-setup-code.ps1')) 'No native setup-code action'
  Assert (Test-Path (Join-Path $root 'installer\scripts\show-setup-code.ps1')) 'No native setup-code viewer'
}
Check 'restore only reopens the shop after media restoration' {
  $restore = Get-Content -Raw (Join-Path $root 'installer\scripts\restore-native.ps1')
  $normalStart = $restore.LastIndexOf("if (`$stoppedByMe) { Start-Service 'tillumi-pos' }")
  Assert ($normalStart -gt $restore.IndexOf('& tar.exe -xzf')) 'API starts before restoring images'
}
Check 'failed update before pointer swap restarts old API and permits retry' {
  $fixture = Join-Path ([IO.Path]::GetTempPath()) ('tillumi-update-regression-' + [guid]::NewGuid().ToString('N'))
  $install = Join-Path $fixture 'install'
  $data = Join-Path $fixture 'data'
  $payload = Join-Path $fixture 'payload'
  New-Item -ItemType Directory -Path $install,$data,$payload | Out-Null
  Set-Content (Join-Path $install 'tillumi-pos.xml') '<service><executable>app-1.0.0\tillumi-pos.exe</executable></service>'
  Set-Content (Join-Path $payload 'incomplete.txt') 'not a complete release'
  $package = Join-Path $fixture 'package.zip'
  Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $package
  $source = Get-Content -Raw (Join-Path $root 'installer\scripts\apply-update.ps1')
  $ast = [Management.Automation.Language.Parser]::ParseInput($source, [ref]$null, [ref]$null)
  $events = Join-Path $fixture 'events.txt'
  foreach ($name in @('Stop-ApiService','Start-ApiService')) {
    $fn = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $true) | Where-Object Name -eq $name
    $event = if ($name -eq 'Stop-ApiService') { 'stop' } else { 'start' }
    $source = $source.Replace($fn.Extent.Text, "function $name { Add-Content -LiteralPath '$events' -Value '$event' }")
  }
  $harness = Join-Path $fixture 'apply-test.ps1'
  Set-Content -LiteralPath $harness -Value $source -Encoding UTF8
  $hash = (Get-FileHash $package -Algorithm SHA256).Hash
  $ErrorActionPreference = 'Continue'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $harness -InstallDir $install -DataDir $data -Version '1.0.1' -PackagePath $package -ExpectedSha256 $hash -TestMode *> (Join-Path $fixture 'result.log')
  $ErrorActionPreference = 'Stop'
  Assert ($LASTEXITCODE -ne 0) 'Broken package unexpectedly succeeded'
  Assert (((Get-Content $events) -join ',') -eq 'stop,start') 'Old API was left stopped'
  Assert (-not (Test-Path (Join-Path $install 'app-1.0.1'))) 'Failed staging prevents retry'
  Assert ((Get-Content -Raw (Join-Path $install 'tillumi-pos.xml')).Contains('app-1.0.0')) 'Old pointer changed'
}
foreach ($unhealthy in @($false, $true)) {
  Check "complete update and post-start rollback (unhealthy=$unhealthy)" {
    $fixture = Join-Path ([IO.Path]::GetTempPath()) ('tillumi-update-complete-' + [guid]::NewGuid().ToString('N'))
    $install = Join-Path $fixture 'install'
    $data = Join-Path $fixture 'data'
    $payload = Join-Path $fixture 'payload'
    New-Item -ItemType Directory -Path $install,$data,$payload,(Join-Path $payload 'web'),(Join-Path $payload 'drizzle'),(Join-Path $install 'app-1.0.0') | Out-Null
    $xml = '<service><executable>app-1.0.0\tillumi-pos.exe</executable><env name="WEB_DIST" value="app-1.0.0\web"/></service>'
    Set-Content (Join-Path $install 'tillumi-pos.xml') $xml
    foreach ($name in @('tillumi-pos.exe','tillumi-migrate.exe','web\index.html','drizzle\journal.txt')) { Set-Content (Join-Path $payload $name) 'fixture' }
    $package = Join-Path $fixture 'package.zip'
    Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $package
    $hash = (Get-FileHash $package -Algorithm SHA256).Hash
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'installer\scripts\apply-update.ps1'),'-InstallDir',$install,'-DataDir',$data,'-Version','1.0.1','-PackagePath',$package,'-ExpectedSha256',$hash,'-TestMode')
    if ($unhealthy) { $arguments += '-SimulateUnhealthy' }
    $ErrorActionPreference = 'Continue'
    & powershell.exe @arguments *> (Join-Path $fixture 'result.log')
    $ErrorActionPreference = 'Stop'
    if ($unhealthy) {
      Assert ($LASTEXITCODE -ne 0) 'Unhealthy update reported success'
      Assert ((Get-Content -Raw (Join-Path $install 'tillumi-pos.xml')).Trim() -eq $xml) 'Rollback did not restore both pointers'
      Assert (-not (Test-Path (Join-Path $install 'app-1.0.1'))) 'Broken version prevents retry'
    } else {
      Assert ($LASTEXITCODE -eq 0) 'Valid update failed'
      Assert ((Get-Content -Raw (Join-Path $install 'tillumi-pos.xml')).Contains('app-1.0.1\web')) 'Web and executable versions diverged'
      Assert (Test-Path (Join-Path $install 'app-1.0.0')) 'Previous version was discarded'
    }
  }
}
if ($failures -gt 0) { throw "$failures regression checks failed" }
