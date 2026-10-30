# Run with Windows PowerShell 5.1; all mutable fixtures live in a disposable TEMP directory.
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$failures = 0
function Check([string]$Name, [scriptblock]$Body) {
  try { & $Body; Write-Host "PASS $Name" } catch { $script:failures++; Write-Host "FAIL $Name : $_" }
}
function Assert([bool]$Value, [string]$Message) { if (-not $Value) { throw $Message } }
$releaseUrl = 'https://github.com/ohmattapon/TillumiPOS/releases/download/v1.0.1/TillumiPOS-update-1.0.1.zip'
# A throwaway publisher: its public key goes in a JWK file like the one the setup .exe installs, and it signs
# the same text as updateSignedMessage (server/src/domains/update-release.ts).
function New-UpdateSigning([string]$Dir, [string]$Version, [string]$Sha256, [string]$Url) {
  $rsa = [System.Security.Cryptography.RSA]::Create(2048)
  try {
    $parameters = $rsa.ExportParameters($false)
    $base64Url = { param($bytes) [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
    $keyPath = Join-Path $Dir ('update-public-key-' + [guid]::NewGuid().ToString('N') + '.json')
    $jwk = '{"kty":"RSA","n":"' + (& $base64Url $parameters.Modulus) + '","e":"' + (& $base64Url $parameters.Exponent) + '"}'
    Set-Content -LiteralPath $keyPath -Value $jwk
    $message = (@('tillumi-update:v1', $Version, $Sha256.ToLowerInvariant(), $Url) -join "`n")
    $signature = [Convert]::ToBase64String($rsa.SignData([Text.Encoding]::UTF8.GetBytes($message),
      [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1))
    return @{ KeyPath = $keyPath; Signature = $signature }
  } finally { $rsa.Dispose() }
}
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
Check 'a service left registered without its program folder does not block the install' {
  Assert ($iss -match "HadApiService := ServiceIsOurs\(ApiService, 'tillumi-pos\.exe'\)") 'An API service is reused without checking it belongs to this folder'
  Assert ($iss -match "HadPostgresService := ServiceIsOurs\(PostgresService, 'tillumi-postgres\.exe'\)") 'A database service is reused without checking it belongs to this folder'
  Assert ($iss -match 'if ServiceExists\(ApiService\) and \(not HadApiService\) then RemoveStaleService\(ApiService\)') 'A service pointing at another folder is not removed before the install'
  $remove = [regex]::Match($iss, '(?s)procedure RemoveStaleService\(const Name: String\);(.*?)\nend;').Groups[1].Value
  Assert ($remove.Contains("'stop ' + Name") -and $remove.Contains("'delete ' + Name")) 'A stale service is deleted without stopping it first'
  Assert ($iss -match "HadApiService and FileExists\(ExpandConstant\('\{app\}\\tillumi-pos\.xml'\)\)") 'A service whose xml file is gone still fails the install'
  Assert ($iss -match "HadPostgresService and FileExists\(ExpandConstant\('\{app\}\\tillumi-postgres\.xml'\)\)") 'A database service whose xml file is gone still fails the install'
}
Check 'the shop can choose the install folder' {
  Assert ($iss -match '(?m)^DisableDirPage=no\r?$') 'The folder page is hidden, so the shop cannot pick where the program goes'
  Assert ($iss -match '(?m)^UsePreviousAppDir=no\r?$') 'A previous install folder is forced, so the shop cannot move the program'
}
Check 'a failed hidden step shows the reason, not just an exit code' {
  Assert (Test-Path (Join-Path $root 'installer\scripts\install-error.ps1')) 'No shared error log helper for the hidden scripts'
  foreach ($script in @('first-install.ps1', 'configure-postgres-service.ps1', 'migrate-native.ps1')) {
    $body = Get-Content -Raw -LiteralPath (Join-Path $root "installer\scripts\$script")
    Assert ($body.Contains("'install-error.ps1'")) "$script does not write its reason to install-error.txt"
    Assert ($body.Contains('Get-InstallErrorMessage')) "$script reports no message"
  }
  $mustScript = [regex]::Match($iss, '(?s)procedure MustRunScript\(.*?\nend;').Value
  Assert ($mustScript.Contains('FailStep(')) 'A failed script step still shows only an exit code'
  $mustCaptured = [regex]::Match($iss, '(?s)procedure MustRunCaptured\(.*?\nend;').Value
  Assert ($mustCaptured.Contains('install-error.txt')) 'A failed service command does not keep the message Windows printed'
  Assert ($mustCaptured.Contains('FailStep(')) 'A failed service command still shows only an exit code'
  Assert ($iss.Contains('-InstallDir "'' + ExpandConstant(''{app}'')')) 'The migration step cannot write its reason next to the program'
  Assert ($iss.Contains('tillumi-pos.err.log')) 'A shop that never answers shows no log line explaining why'
}
Check 'native setup code is accessible without Podman' {
  Assert ($iss.Contains('show-setup-code.ps1')) 'No native setup-code action'
  Assert (Test-Path (Join-Path $root 'installer\scripts\show-setup-code.ps1')) 'No native setup-code viewer'
}
Check 'the desktop app is copied only when DesktopDir is given, and the shortcuts prefer it' {
  $files = $iss.Substring($iss.IndexOf('[Files]'), $iss.IndexOf('[Icons]') - $iss.IndexOf('[Files]'))
  $icons = $iss.Substring($iss.IndexOf('[Icons]'), $iss.IndexOf('[Run]') - $iss.IndexOf('[Icons]'))
  Assert ($iss.Contains('DesktopDir')) 'No DesktopDir define'
  Assert ($iss -match '(?m)^#ifdef DesktopDir\s*$') 'The desktop entries are not guarded by the DesktopDir define'
  Assert ($iss -match 'FileExists\(DesktopDir \+ "\\\\TillumiPOS\.exe"\)') 'A DesktopDir without TillumiPOS.exe is not refused at compile time'
  $guarded = $files.Substring($files.IndexOf('#ifdef DesktopDir'))
  $guarded = $guarded.Substring(0, $guarded.IndexOf('#endif'))
  Assert ($guarded.Contains('{#DesktopDir}') -and $guarded.Contains('DestDir: "{app}\desktop"')) 'The desktop folder is not copied to {app}\desktop inside the guard'
  Assert (([regex]::Matches($files, '\{#DesktopDir\}')).Count -eq 1) 'DesktopDir is used outside its single guarded entry'
  Assert ($iss -match 'function HaveDesktopApp\(\): Boolean') 'No HaveDesktopApp check'
  Assert ($iss -match "FileExists\(ExpandConstant\('\{app\}\\desktop\\TillumiPOS\.exe'\)\)") 'HaveDesktopApp does not test the installed exe'
  foreach ($place in '{autodesktop}', '{group}') {
    $lines = @($icons -split "`n" | Where-Object { $_.StartsWith('Name: "' + $place + '\เปิดหน้าร้าน"') })
    Assert ($lines.Count -eq 4) "Expected the app shortcut and three browser fallbacks in $place, found $($lines.Count)"
    Assert ($lines[0].Contains('{app}\desktop\TillumiPOS.exe') -and $lines[0].Contains('Check: HaveDesktopApp')) "The desktop app shortcut is not first in $place"
    Assert (-not $lines[0].Contains('TILLUMI_SHOP_URL')) "The shortcut passes the shop URL on the command line in $place"
    Assert ($lines[1].Contains('{code:ChromePath}') -and $lines[1].Contains('--kiosk') -and $lines[1].Contains('HaveChrome')) "Chrome fallback missing in $place"
    Assert ($lines[2].Contains('{code:EdgePath}') -and $lines[2].Contains('--kiosk') -and $lines[2].Contains('HaveEdgeOnly')) "Edge fallback missing in $place"
    Assert ($lines[3].Contains('Filename: "{#ShopUrl}"') -and $lines[3].Contains('HaveNoKioskBrowser')) "Plain browser fallback missing in $place"
  }
  # One shortcut per place: every browser check is false when the desktop app is there.
  foreach ($name in 'HaveChrome', 'HaveEdgeOnly', 'HaveNoKioskBrowser') {
    $body = [regex]::Match($iss, "(?s)function $name\(\): Boolean;\s*begin(.*?)\nend;").Groups[1].Value
    Assert ($body.Contains('not HaveDesktopApp()')) "$name does not stand down for the desktop app"
  }
  $link = [regex]::Match($iss, '(?s)function GetShopLink\(Param: String\): String;\s*begin(.*?)\nend;').Groups[1].Value
  Assert ($link.Contains('HaveDesktopApp()') -and $link.Contains('autodesktop')) 'Open-the-shop-now does not prefer the desktop app and keep the old choice'
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
  $signed = New-UpdateSigning $fixture '1.0.1' $hash $releaseUrl
  $ErrorActionPreference = 'Continue'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $harness -InstallDir $install -DataDir $data -Version '1.0.1' -PackagePath $package -ExpectedSha256 $hash -ReleaseUrl $releaseUrl -Signature $signed.Signature -PublicKeyPath $signed.KeyPath -TestMode *> (Join-Path $fixture 'result.log')
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
    $signed = New-UpdateSigning $fixture '1.0.1' $hash $releaseUrl
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'installer\scripts\apply-update.ps1'),'-InstallDir',$install,'-DataDir',$data,'-Version','1.0.1','-PackagePath',$package,'-ExpectedSha256',$hash,'-ReleaseUrl',$releaseUrl,'-Signature',$signed.Signature,'-PublicKeyPath',$signed.KeyPath,'-TestMode')
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
Check 'the API service gets its database password from .env only, and is marked as a native install' {
  [xml]$apiXml = Get-Content -Raw (Join-Path $root 'installer\winsw\tillumi-pos.xml')
  $names = @($apiXml.service.env | ForEach-Object { $_.name })
  Assert (-not ($names -contains 'DATABASE_URL')) 'A DATABASE_URL in the service would override the one with the password in .env'
  Assert (($apiXml.service.env | Where-Object { $_.name -eq 'NATIVE_UPDATES' }).value -eq '1') 'The service does not turn on native updates'
}
Check 'first install locks the data folder before writing any secret' {
  $first = Get-Content -Raw (Join-Path $root 'installer\scripts\first-install.ps1')
  $lock = $first.IndexOf("'protect-data-dir.ps1'")
  Assert ($lock -gt 0) 'first-install does not lock the data folder'
  Assert ($lock -lt $first.IndexOf('initdb.exe'')') -and $lock -lt $first.IndexOf('JWT_SECRET=')) 'Secrets are written before the folder is locked'
  Assert ($first -notmatch '--auth-(local|host)=trust') 'initdb still trusts local connections'
}
Check 'protect-data-dir leaves only SYSTEM and Administrators (plus the test account) on the data folder' {
  $fixture = Join-Path ([IO.Path]::GetTempPath()) ('tillumi-protect-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path (Join-Path $fixture 'logs') | Out-Null
  Set-Content (Join-Path $fixture '.env') 'JWT_SECRET=x'
  $me = '*' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  try {
    & (Join-Path $root 'installer\scripts\protect-data-dir.ps1') -DataDir $fixture -AlsoGrant $me
    foreach ($path in @($fixture, (Join-Path $fixture '.env'), (Join-Path $fixture 'logs'))) {
      $sids = @((Get-Acl -LiteralPath $path).Access | ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value })
      $allowed = @('S-1-5-18', 'S-1-5-32-544', $me.TrimStart('*'))
      $other = @($sids | Where-Object { $allowed -notcontains $_ })
      Assert ($other.Count -eq 0) "Other accounts can still open $path : $($other -join ', ')"
      Assert ($sids -contains 'S-1-5-18' -and $sids -contains 'S-1-5-32-544') "SYSTEM or Administrators lost access to $path"
    }
  } finally { Remove-Item -LiteralPath $fixture -Recurse -Force -ErrorAction SilentlyContinue }
}
Check 'the setup code shortcut asks for administrator rights, since the logs are locked' {
  $show = Get-Content -Raw (Join-Path $root 'installer\scripts\show-setup-code.ps1')
  Assert ($show.Contains('-Verb RunAs')) 'show-setup-code cannot read the locked logs as a normal user'
}
Check 'the setup installs the publisher key where only an administrator can write' {
  Assert ($iss.Contains('update-public-key.json"; DestDir: "{app}";')) 'Setup does not install the publisher key beside the program'
}
foreach ($case in @('wrong-url', 'wrong-key', 'no-signature', 'no-key-file', 'unconfigured-key')) {
  Check "update the publisher did not sign is refused before anything changes ($case)" {
    $fixture = Join-Path ([IO.Path]::GetTempPath()) ('tillumi-update-unsigned-' + [guid]::NewGuid().ToString('N'))
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
    $signed = New-UpdateSigning $fixture '1.0.1' $hash $releaseUrl
    $url = $releaseUrl; $signature = $signed.Signature; $keyPath = $signed.KeyPath
    switch ($case) {
      'wrong-url' { $url = 'https://github.com/ohmattapon/TillumiPOS/releases/download/v1.0.1/other.zip' }
      'wrong-key' { $keyPath = (New-UpdateSigning $fixture '1.0.1' $hash $releaseUrl).KeyPath }
      'no-signature' {
        # A marker like the one an API without signing wrote: version and hash, no url or signature.
        $signature = ''
        $stagedDir = Join-Path $data 'updates\1.0.1'
        New-Item -ItemType Directory -Path $stagedDir | Out-Null
        Set-Content -LiteralPath (Join-Path $stagedDir 'pending.json') ('{"version":"1.0.1","sha256":"' + $hash.ToLowerInvariant() + '","packagePath":"' + $package.Replace('\', '\\') + '"}')
      }
      'no-key-file' { $keyPath = Join-Path $fixture 'missing.json' }
      'unconfigured-key' { $keyPath = Join-Path $fixture 'empty-key.json'; Set-Content -LiteralPath $keyPath '{"kty":"RSA","n":"","e":"AQAB"}' }
    }
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'installer\scripts\apply-update.ps1'),'-InstallDir',$install,'-DataDir',$data,'-Version','1.0.1','-PackagePath',$package,'-ExpectedSha256',$hash,'-ReleaseUrl',$url,'-PublicKeyPath',$keyPath,'-TestMode')
    if ($signature -ne '') { $arguments += @('-Signature',$signature) }
    $ErrorActionPreference = 'Continue'
    & powershell.exe @arguments *> (Join-Path $fixture 'result.log')
    $exit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    Assert ($exit -ne 0) "Unsigned update was installed ($case)"
    Assert ((Get-Content -Raw (Join-Path $fixture 'result.log')) -match 'ลายเซ็น|กุญแจ') "Refused for a reason other than the signature ($case)"
    Assert ((Get-Content -Raw (Join-Path $install 'tillumi-pos.xml')).Trim() -eq $xml) "Service pointer changed ($case)"
    Assert (-not (Test-Path (Join-Path $install 'app-1.0.1'))) "New version was unpacked ($case)"
  }
}
if ($failures -gt 0) { throw "$failures regression checks failed" }
