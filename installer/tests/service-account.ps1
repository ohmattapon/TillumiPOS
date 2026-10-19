# Exercise account/ACL orchestration without administrative rights or a real service.
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('tillumi-service-account-' + [guid]::NewGuid().ToString('N'))
$install = Join-Path $fixture 'program'
$data = Join-Path $fixture 'shop'
New-Item -ItemType Directory -Path $install,$data,(Join-Path $data 'pgdata'),(Join-Path $data 'logs') | Out-Null
$global:TillumiServiceTestaccount = 'LocalSystem'
$global:TillumiServiceTeststate = 'Stopped'
$global:TillumiServiceTestaclFail = $false
$global:TillumiServiceTestchangeCode = 0
$global:TillumiServiceTestwrongAccount = $false
$global:TillumiServiceTestgrants = @()
$global:TillumiServiceTestchanges = 0
function Get-CimInstance {
  param($ClassName, $Filter)
  [pscustomobject]@{ State = $global:TillumiServiceTeststate; StartName = $global:TillumiServiceTestaccount }
}
function Invoke-CimMethod {
  param($InputObject, $MethodName, $Arguments)
  $global:TillumiServiceTestchanges++
  if ($Arguments.StartName -ne 'NT AUTHORITY\LocalService' -or $Arguments.StartPassword -ne '') { throw 'Wrong account/password passed to SCM' }
  if (-not $global:TillumiServiceTestwrongAccount) { $global:TillumiServiceTestaccount = $Arguments.StartName }
  [pscustomobject]@{ReturnValue = $global:TillumiServiceTestchangeCode}
}
function icacls.exe {
  $global:TillumiServiceTestgrants += ,@($args)
  $global:LASTEXITCODE = if ($global:TillumiServiceTestaclFail) { 5 } else { 0 }
}
$runner = Join-Path $root 'installer\scripts\configure-postgres-service.ps1'
& $runner -InstallDir $install -DataDir $data
if ($global:TillumiServiceTestaccount -ne 'NT AUTHORITY\LocalService' -or $global:TillumiServiceTestgrants.Count -ne 4) { throw 'Account or ACLs were not repaired' }
if ($global:TillumiServiceTestgrants[0][2] -ne '*S-1-5-19:(OI)(CI)RX' -or $global:TillumiServiceTestgrants[0][0] -ne $install) { throw 'Program directory must be read/execute only' }
if ($global:TillumiServiceTestgrants[2][2] -ne '*S-1-5-19:(OI)(CI)M' -or $global:TillumiServiceTestgrants[2][0] -ne (Join-Path $data 'pgdata')) { throw 'Cluster needs modify permission' }
& $runner -InstallDir $install -DataDir $data
Write-Host 'PASS fresh/legacy account repair, limited ACLs, and repeated configuration'

foreach ($case in @('acl','scm','verification','running')) {
  $global:TillumiServiceTestaclFail = $case -eq 'acl'
  $global:TillumiServiceTestchangeCode = if ($case -eq 'scm') { 5 } else { 0 }
  $global:TillumiServiceTestwrongAccount = $case -eq 'verification'
  $global:TillumiServiceTestaccount = 'LocalSystem'
  $global:TillumiServiceTeststate = if ($case -eq 'running') { 'Running' } else { 'Stopped' }
  $global:TillumiServiceTestgrants = @()
  $global:TillumiServiceTestchanges = 0
  $failed = $false
  try { & $runner -InstallDir $install -DataDir $data } catch { $failed = $true }
  if (-not $failed) { throw "Configuration ignored $case failure" }
  if ($case -eq 'acl' -and $global:TillumiServiceTestchanges -ne 0) { throw 'Account changed despite failed permissions' }
  if ($case -eq 'running' -and $global:TillumiServiceTestgrants.Count -ne 0) { throw 'Running service was modified' }
  Write-Host "PASS $case failure aborts installation"
}
