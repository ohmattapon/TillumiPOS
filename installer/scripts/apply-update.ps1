# ติดตั้งอัปเดต TillumiPOS บนเครื่องร้าน (Task 4 คู่กับ server/src/modules/update).
#
# ภาพรวม (เบราว์เซอร์หยุด Windows service ไม่ได้ จึงแยกเป็นสองขั้น):
#   1. เจ้าของกด "โหลดรุ่นใหม่" ในหน้าตั้งค่า: ตัว API โหลดไฟล์รุ่นใหม่จาก feed
#      (URL ตายตัวในโค้ด) ตรวจ SHA-256 แล้ววางไว้ที่ <DataDir>\updates\<รุ่น>\
#      พร้อม pending.json (ดู PendingUpdate ใน update-staging.port.ts)
#   2. สคริปต์นี้ (ต้องสิทธิ์แอดมิน — ดับเบิลคลิกแบบ Run as administrator หรือให้ช่างรัน):
#      ตรวจแฮชซ้ำ -> หยุด tillumi-pos -> แตกไฟล์เป็น app-<รุ่นใหม่> -> รัน
#      tillumi-migrate.exe (อัปฐานข้อมูลก่อนสตาร์ทเสมอ ตามลำดับเดียวกับ
#      installer/tillumi.iss) -> ชี้ tillumi-pos.xml ไปรุ่นใหม่ -> สตาร์ท ->
#      ตรวจว่าหน้าร้านตอบ -> เก็บรุ่นเก่าไว้ 1 รุ่น (rollback) ลบรุ่นที่เก่ากว่านั้น
#
#   พังตรงไหน = ชี้ xml กลับรุ่นเดิม + สตาร์ท + ตรวจสุขภาพ (rollback) แล้วจบด้วย
#   รหัสไม่เป็น 0 เสมอ ข้อมูลร้าน (ProgramData) ไม่โดนแตะเลยตลอดทาง
#
# วิธีใช้ (ยกระดับสิทธิ์ก่อนเสมอ):
#   powershell -ExecutionPolicy Bypass -File apply-update.ps1
#     [-InstallDir 'C:\Program Files\TillumiPOS'] [-DataDir 'C:\ProgramData\TillumiPOS']
#     [-Version '1.0.1'] [-PackagePath '...\package.zip'] [-ExpectedSha256 '...']
#   ไม่ส่ง -Version/-PackagePath/-ExpectedSha256 = อ่านจาก pending.json ที่ API เขียนไว้
#
# ทดสอบโดยไม่ต้องแอดมิน (ตรรกะแฮช/สลับโฟลเดอร์/rollback บนข้อมูลปลอมใน TEMP):
#   apply-update.ps1 -InstallDir "$env:TEMP\fake\app" -DataDir "$env:TEMP\fake\data" -TestMode
#   เติม -SimulateUnhealthy เพื่อซ้อม rollback (บังคับให้ตรวจสุขภาพล้ม)
#   -TestMode ข้ามเฉพาะคำสั่งที่ต้องแอดมิน (net stop/start, migrate .exe, HTTP):
#   การเขียนไฟล์/แฮช/rollback ยังทำจริงทั้งหมด ห้ามใช้กับเครื่องร้านจริง
param(
  [string]$InstallDir = 'C:\Program Files\TillumiPOS',
  [string]$DataDir = 'C:\ProgramData\TillumiPOS',
  [string]$Version = '',
  [string]$PackagePath = '',
  [string]$ExpectedSha256 = '',
  [int]$PortDb = 5435,
  [int]$PortApi = 3000,
  [switch]$TestMode,
  [switch]$SimulateUnhealthy
)

$ErrorActionPreference = 'Stop'

$ApiService = 'tillumi-pos'
$ShopUrl = "http://127.0.0.1:$PortApi"
$script:healthChecks = 0

if ($SimulateUnhealthy -and -not $TestMode) { throw '-SimulateUnhealthy ใช้คู่กับ -TestMode เท่านั้น (ไว้ซ้อม rollback บนข้อมูลปลอม)' }

function Get-FileSha256([string]$Path) {
  (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-PackageHash([string]$Path, [string]$Expected) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "ไม่พบไฟล์อัปเดต: $Path (ยังไม่มีอะไรเปลี่ยน)" }
  $actual = Get-FileSha256 $Path
  if ($actual -ne $Expected.ToLowerInvariant()) {
    throw "ไฟล์อัปเดตไม่ตรงกับลายเซ็น (แฮชไม่ตรง) หยุดก่อนแตะ service — โหลดใหม่แล้วลองอีกครั้ง"
  }
}

function Read-PendingUpdate([string]$UpdatesDir) {
  $found = Get-ChildItem -Path $UpdatesDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
    ForEach-Object {
      $marker = Join-Path $_.FullName 'pending.json'
      if (Test-Path -LiteralPath $marker) {
        $parsed = Get-Content -Raw -LiteralPath $marker | ConvertFrom-Json
        [pscustomobject]@{ Version = [string]$parsed.version; Sha256 = [string]$parsed.sha256; Package = [string]$parsed.packagePath; Dir = $_.FullName }
      }
    } |
    Sort-Object Version -Descending |
    Select-Object -First 1
  return $found
}

function Get-CurrentAppVersion([string]$XmlPath) {
  $xml = Get-Content -Raw -LiteralPath $XmlPath
  $match = [regex]::Match($xml, 'app-(\d+\.\d+\.\d+)')
  if (-not $match.Success) { throw "อ่านรุ่นปัจจุบันจาก $XmlPath ไม่ได้ (ไม่พบ app-x.y.z) หยุดก่อนแตะ service" }
  return $match.Groups[1].Value
}

function Write-ServiceXmlPointer([string]$XmlPath, [string]$OldVersion, [string]$NewVersion) {
  Copy-Item -LiteralPath $XmlPath "$XmlPath.bak" -Force
  $xml = Get-Content -Raw -LiteralPath $XmlPath
  # แทนเฉพาะ pointer รุ่น (ทั้ง <executable> และ WEB_DIST ชี้ app-<รุ่น> ทั้งคู่)
  $xml = $xml.Replace("app-$OldVersion", "app-$NewVersion")
  if ($xml -match '\{\{[A-Z_]+\}\}') { throw "ไฟล์ service ยังมีช่องว่าง {{...}} ที่ไม่ได้กรอก หยุดก่อนสตาร์ท" }
  [IO.File]::WriteAllText($XmlPath, $xml, [Text.UTF8Encoding]::new($false))
}

function Remove-SupersededAppDirs([string]$InstallDir, [string]$KeepNew, [string]$KeepOld) {
  # เก็บไว้ 2 รุ่นเท่านั้น: รุ่นที่เพิ่งติดตั้ง + 1 รุ่นก่อนหน้า (ไว้ rollback) รุ่นที่เก่ากว่านั้นลบ
  Get-ChildItem -Path $InstallDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^app-\d+\.\d+\.\d+$' -and $_.Name -ne "app-$KeepNew" -and $_.Name -ne "app-$KeepOld" } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
}

function Test-ShopHealth([string]$Url) {
  if ($TestMode) {
    # ซ้อมพัง: เฉพาะ check แรก (รุ่นใหม่ที่เพิ่งสลับ) ล้ม ส่วน check หลัง rollback
    # ผ่าน — จำลองว่ารุ่นเดิมยังดีอยู่จริง เหมือนเครื่องร้าน
    if ($SimulateUnhealthy) { $script:healthChecks++; return ($script:healthChecks -gt 1) }
    return $true
  }
  for ($i = 0; $i -lt 30; $i++) {
    try {
      # /api/v1/setup อ่านตาราง users แปลว่าต่อฐานข้อมูลที่อัปแล้วได้จริง ไม่ใช่แค่โปรแกรมติด
      $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $Url
      if ($response.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Stop-ApiService {
  if ($TestMode) { return }
  & net.exe stop $ApiService | Out-Null
}

function Start-ApiService {
  if ($TestMode) { return }
  & net.exe start $ApiService | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "สตาร์ท service $ApiService ไม่ติด กรุณาแจ้งช่าง (ไฟล์รุ่นเดิมยังอยู่ครบ)" }
}

# ---- 1. หา pending + ตรวจแฮชก่อนแตะ service ----
$updatesDir = Join-Path $DataDir 'updates'
if ($Version -eq '' -or $PackagePath -eq '' -or $ExpectedSha256 -eq '') {
  $pending = Read-PendingUpdate $updatesDir
  if ($null -eq $pending) { throw "ยังไม่มีรุ่นใหม่ที่เตรียมไว้ ให้เจ้าของกด 'โหลดรุ่นใหม่' ในหน้าตั้งค่าก่อน (ยังไม่มีอะไรเปลี่ยน)" }
  if ($Version -eq '') { $Version = $pending.Version }
  if ($PackagePath -eq '') { $PackagePath = $pending.Package }
  if ($ExpectedSha256 -eq '') { $ExpectedSha256 = $pending.Sha256 }
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "รุ่นไม่ถูกต้อง: $Version (ยังไม่มีอะไรเปลี่ยน)" }
Assert-PackageHash $PackagePath $ExpectedSha256

$xmlPath = Join-Path $InstallDir 'tillumi-pos.xml'
if (-not (Test-Path -LiteralPath $xmlPath)) { throw "ไม่พบ $xmlPath (เครื่องนี้ติดตั้งแบบ native หรือไม่)" }
$currentVersion = Get-CurrentAppVersion $xmlPath
if ($Version -eq $currentVersion) {
  Write-Host "เป็นรุ่น $Version อยู่แล้ว ไม่ต้องทำอะไร"
  exit 0
}

$newDir = Join-Path $InstallDir "app-$Version"
if (Test-Path -LiteralPath $newDir) { throw "มีโฟลเดอร์ $newDir อยู่แล้ว ลบหรือย้ายออกก่อนแล้วลองใหม่ (ยังไม่มีอะไรเปลี่ยน)" }

# ---- 2. หยุด service แล้วติดตั้ง ----
Stop-ApiService
$swapped = $false
try {
  Expand-Archive -LiteralPath $PackagePath -DestinationPath $newDir -Force
  foreach ($need in @('tillumi-pos.exe', 'tillumi-migrate.exe', 'web', 'drizzle')) {
    if (-not (Test-Path -LiteralPath (Join-Path $newDir $need))) {
      throw "ไฟล์อัปเดตไม่ครบ: ขาด $need (ยังไม่สลับรุ่น)"
    }
  }

  # อัปฐานข้อมูลก่อนสตาร์ทเสมอ (migrate-then-start ตาม installer/tillumi.iss):
  # postgres ไม่ได้หยุดไปด้วยจึงใช้ต่อได้เลย พังขั้นนี้ = รุ่นเก่ายังไม่โดนแตะ
  if (-not $TestMode) {
    $migrate = Join-Path $newDir 'tillumi-migrate.exe'
    $env:MIGRATIONS_DIR = Join-Path $newDir 'drizzle'
    $env:DATABASE_URL = "postgres://pos@127.0.0.1:$PortDb/pos"
    try {
      & $migrate
      if ($LASTEXITCODE -ne 0) { throw "อัปฐานข้อมูลไม่สำเร็จ (รหัส $LASTEXITCODE)" }
    } finally {
      Remove-Item Env:\MIGRATIONS_DIR -ErrorAction SilentlyContinue
      Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
    }
  }

  Write-ServiceXmlPointer $xmlPath $currentVersion $Version
  $swapped = $true
  Start-ApiService

  if (-not (Test-ShopHealth "$ShopUrl/api/v1/setup")) { throw "สตาร์ทแล้วแต่หน้าร้านไม่ตอบ" }

  # ---- 3. สำเร็จ: เก็บรุ่นเก่าไว้ 1 รุ่น ล้าง staging ----
  Remove-SupersededAppDirs $InstallDir $Version $currentVersion
  Remove-Item -LiteralPath "$xmlPath.bak" -Force -ErrorAction SilentlyContinue
  $stagedDir = Join-Path $updatesDir $Version
  if (Test-Path -LiteralPath $stagedDir) { Remove-Item -LiteralPath $stagedDir -Recurse -Force }
  Write-Host "อัปเดตเป็นรุ่น $Version สำเร็จ (รุ่น $currentVersion ยังเก็บไว้ rollback)"
  exit 0
} catch {
  $reason = $_.Exception.Message
  if (-not $swapped) {
    throw "ติดตั้งรุ่น $Version ไม่สำเร็จ ($reason) — รุ่นเดิมยังอยู่ ไม่มีการเปลี่ยน"
  }
  # rollback: ชี้กลับรุ่นเดิม + สตาร์ท (โฟลเดอร์รุ่นที่พังลบทิ้ง ไม่เก็บของเสียไว้)
  Copy-Item -LiteralPath "$xmlPath.bak" -Destination $xmlPath -Force
  if (Test-Path -LiteralPath $newDir) { Remove-Item -LiteralPath $newDir -Recurse -Force }
  $backUp = $false
  try {
    Start-ApiService
    $backUp = Test-ShopHealth "$ShopUrl/api/v1/setup"
  } catch { $backUp = $false }
  # ตั้งใจจบด้วยรหัสผิดพลาดทั้งสองทาง: รุ่นใหม่ไม่ได้ใช้ ผู้เรียกรู้ว่าอัปเดตล้ม
  if ($backUp) { throw "ติดตั้งรุ่น $Version ไม่สำเร็จ ($reason) — กลับไปรุ่น $currentVersion แล้ว เปิดร้านต่อได้" }
  throw "ติดตั้งรุ่น $Version ไม่สำเร็จ ($reason) และ rollback สตาร์ทไม่ติด กรุณาแจ้งช่างด่วน (ไฟล์รุ่น $currentVersion ยังอยู่ครบที่ $InstallDir)"
}
