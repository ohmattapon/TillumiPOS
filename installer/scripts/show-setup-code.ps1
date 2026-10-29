# Read the setup code from the existing service log into memory only.
# Never put it in a URL, a separate file, or the database.
param(
  [string]$DataDir = 'C:\ProgramData\TillumiPOS',
  [int]$PortApi = 3000
)
$ErrorActionPreference = 'Stop'
# The logs (which hold the code) are readable by SYSTEM and Administrators only (protect-data-dir.ps1),
# so a normal start from the Start menu asks Windows for administrator rights first.
$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -DataDir `"$DataDir`" -PortApi $PortApi"
  try { Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs | Out-Null } catch { exit 1 }
  exit 0
}
Add-Type -AssemblyName System.Windows.Forms
try {
  $status = Invoke-RestMethod -Uri "http://127.0.0.1:$PortApi/api/v1/setup" -TimeoutSec 5
  if (-not $status.needsSetup) {
    [void][Windows.Forms.MessageBox]::Show('ร้านนี้ตั้งค่าแล้ว เปิดหน้าร้านแล้วลงชื่อเข้าใช้ได้เลย', 'TillumiPOS')
    exit 0
  }
  $code = $null
  $logs = Get-ChildItem -LiteralPath (Join-Path $DataDir 'logs') -Filter 'tillumi-pos.out.log*' -File |
    Sort-Object LastWriteTime -Descending
  foreach ($log in $logs) {
    $text = Get-Content -Raw -LiteralPath $log.FullName -Encoding UTF8
    $found = [regex]::Matches($text, 'SETUP CODE[^\r\n]*:\s*([A-Z0-9]{12})')
    if ($found.Count -gt 0) { $code = $found[$found.Count - 1].Groups[1].Value; break }
  }
  if (-not $code) { throw 'ยังไม่พบรหัสตั้งค่า รอสักครู่แล้วเปิดรหัสตั้งค่าร้านจากเมนู Start อีกครั้ง' }
  [void][Windows.Forms.MessageBox]::Show("รหัสตั้งค่าร้านครั้งแรก: $code`r`n`r`nนำรหัสนี้ไปกรอกในหน้าตั้งค่าร้าน ห้ามส่งให้ผู้อื่น", 'TillumiPOS')
} catch {
  [void][Windows.Forms.MessageBox]::Show('อ่านรหัสตั้งค่าไม่ได้ ตรวจว่าระบบร้านทำงานอยู่ แล้วเปิดรหัสตั้งค่าร้านจากเมนู Start อีกครั้ง หากยังไม่ได้โปรดติดต่อผู้ดูแล', 'TillumiPOS')
  exit 1
}
