param([switch]$AutoStart, [string]$PreviewPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$program = $PSScriptRoot
$shop = Join-Path $env:LOCALAPPDATA 'TillumiPOS/shop'
$powershell = "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe"
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($admin -and -not $PreviewPath) {
  [Windows.Forms.MessageBox]::Show('กรุณาเปิด TillumiPOS ตามปกติ โดยไม่เลือก Run as administrator เพื่อใช้ข้อมูลร้านของบัญชี Windows นี้', 'TillumiPOS') | Out-Null
  exit 1
}
$created = $false
$mutex = [Threading.Mutex]::new($true, 'Local\TillumiPOS.Control', [ref]$created)
if (-not $created) {
  [Windows.Forms.MessageBox]::Show('TillumiPOS เปิดอยู่แล้ว ดูหน้าต่างเดิมในแถบงานด้านล่าง', 'TillumiPOS') | Out-Null
  $mutex.Dispose()
  exit
}
$script:process = $null
$script:result = $null
$script:action = 'Start'
$script:networkAsked = $false
$form = New-Object Windows.Forms.Form
$form.Text = 'TillumiPOS'
$form.ClientSize = New-Object Drawing.Size(720, 510)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.Font = New-Object Drawing.Font('Tahoma', 10)
$form.BackColor = [Drawing.Color]::White

function Add-Text([string]$Text, [int]$X, [int]$Y, [int]$Width, [int]$Height) {
  $label = New-Object Windows.Forms.Label
  $label.Text = $Text
  $label.Location = New-Object Drawing.Point($X, $Y)
  $label.Size = New-Object Drawing.Size($Width, $Height)
  $form.Controls.Add($label)
  $label
}
function Add-Button([string]$Text, [int]$X, [int]$Y, [int]$Width, [scriptblock]$Click) {
  $button = New-Object Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Object Drawing.Point($X, $Y)
  $button.Size = New-Object Drawing.Size($Width, 40)
  $button.FlatStyle = 'System'
  $button.Add_Click($Click)
  $form.Controls.Add($button)
  $button
}
$title = Add-Text 'TillumiPOS' 28 22 650 38
$title.Font = New-Object Drawing.Font('Tahoma', 21, [Drawing.FontStyle]::Bold)
$subtitle = Add-Text 'ระบบร้านบนคอมพิวเตอร์เครื่องหลัก' 30 70 660 28
$subtitle.ForeColor = [Drawing.Color]::DimGray
$status = Add-Text 'กำลังเตรียมระบบ...' 30 117 660 58
$status.Font = New-Object Drawing.Font('Tahoma', 12, [Drawing.FontStyle]::Bold)
$progress = New-Object Windows.Forms.ProgressBar
$progress.Location = New-Object Drawing.Point(30, 182)
$progress.Size = New-Object Drawing.Size(660, 10)
$progress.Style = 'Marquee'
$form.Controls.Add($progress)
$detail = Add-Text 'ครั้งแรกต้องเชื่อมต่ออินเทอร์เน็ตเพื่อเตรียมโปรแกรม อาจใช้เวลาหลายนาที' 30 212 660 54
$setup = Add-Text '' 30 273 660 40
$setup.Font = New-Object Drawing.Font('Tahoma', 12, [Drawing.FontStyle]::Bold)
$lan = Add-Text 'เครื่องอื่นในร้านต้องเชื่อมต่อ Wi-Fi หรือสายแลนเดียวกัน' 30 323 660 45
$open = Add-Button 'เปิดหน้าร้าน' 30 385 150 { if ($script:result) { Start-Process $script:result.Url } }
$retry = Add-Button 'เริ่มระบบ / ลองใหม่' 190 385 160 { Start-Operation 'Start' }
$backup = Add-Button 'สำรองข้อมูล' 360 385 150 { Start-Operation 'Backup' }
$network = Add-Button 'เชื่อมต่อเครื่องอื่น' 520 385 170 { Repair-ShopNetwork }
$logs = Add-Button 'ดูบันทึกปัญหา' 30 446 150 { if (Test-Path (Join-Path $shop 'launcher.log')) { Start-Process notepad.exe -ArgumentList ('"' + (Join-Path $shop 'launcher.log') + '"') } }
$files = Add-Button 'เปิดโฟลเดอร์สำรอง' 190 446 160 { $directory = Join-Path $shop 'backups'; New-Item -ItemType Directory -Force $directory | Out-Null; Start-Process explorer.exe -ArgumentList ('"' + $directory + '"') }
$stop = Add-Button 'หยุดระบบร้าน' 360 446 150 {
  $answer = [Windows.Forms.MessageBox]::Show('เครื่องอื่นในร้านจะใช้งานไม่ได้จนกว่าจะเริ่มระบบอีกครั้ง ต้องการหยุดระบบหรือไม่?', 'หยุดระบบร้าน', 'YesNo', 'Question')
  if ($answer -eq 'Yes') { Start-Operation 'Stop' }
}
$stop.Enabled = $false
$open.Enabled = $false
$backup.Enabled = $false
$network.Enabled = $false

$stages = @{
  VALIDATING = 'กำลังตรวจสอบไฟล์ติดตั้ง'
  STARTING_ENGINE = 'กำลังเตรียมโปรแกรมที่ใช้เปิดระบบ'
  STOPPING_FOR_UPDATE = 'กำลังพักการขายเพื่ออัปเดต'
  BACKING_UP = 'กำลังสำรองฐานข้อมูลและรูปสินค้า'
  BACKUP_READY = 'สำรองข้อมูลแล้ว'
  LOADING_IMAGE = 'กำลังนำเข้าระบบรุ่นใหม่'
  STARTING_SHOP = 'กำลังเปิดระบบร้าน'
  READY = 'พร้อมใช้งาน'
  STOPPED = 'หยุดระบบแล้ว'
}
$errors = @{
  INVALID_PAYLOAD = 'ไฟล์ติดตั้งไม่ครบหรือเสียหาย กรุณาดาวน์โหลดตัวติดตั้งใหม่'
  INVALID_PORT = 'หมายเลขพอร์ตในไฟล์ตั้งค่าไม่ถูกต้อง กรุณาติดต่อผู้ดูแล'
  PORT_IN_USE = 'มีโปรแกรมอื่นใช้พอร์ตของร้านอยู่ ปิดระบบเดิมก่อนแล้วกดลองใหม่'
  OPERATION_BUSY = 'กำลังติดตั้งหรือสำรองข้อมูลจากอีกหน้าต่าง โปรดรอให้เสร็จก่อน'
  INCOMPLETE_INSTALL = 'พบการติดตั้งที่ยังไม่สมบูรณ์ ระบบเก็บข้อมูลเดิมไว้ กรุณาติดต่อผู้ดูแล'
  DOWNGRADE_BLOCKED = 'ตัวติดตั้งนี้เก่ากว่าระบบร้าน กรุณาใช้ตัวติดตั้งรุ่นใหม่กว่า'
  VERSION_REUSED = 'พบไฟล์รุ่นเดียวกันที่มีเนื้อหาต่างกัน กรุณาติดต่อผู้ดูแลเพื่อรับรุ่นใหม่'
  BACKUP_FAILED = 'สำรองข้อมูลไม่สำเร็จ จึงยังไม่อัปเดต ตรวจพื้นที่ว่างแล้วลองใหม่'
  HEALTH_FAILED = 'ระบบยังไม่พร้อมใช้งาน ข้อมูลสำรองยังอยู่ กรุณาติดต่อผู้ดูแลก่อนกู้คืน'
  ENGINE_COMMAND_FAILED = 'โปรแกรมที่ใช้เปิดระบบทำงานไม่สำเร็จ ตรวจอินเทอร์เน็ตและพื้นที่ว่างแล้วลองใหม่'
  COMPOSE_COMMAND_FAILED = 'เปิดระบบร้านไม่สำเร็จ ตรวจอินเทอร์เน็ตและพื้นที่ว่างแล้วลองใหม่'
  START_FAILED = 'เริ่มระบบไม่สำเร็จ ตรวจอินเทอร์เน็ต พื้นที่ว่าง และการเปิด Virtualization แล้วลองใหม่'
  PREREQUISITE_MISSING = 'ติดตั้งโปรแกรมที่จำเป็นไม่สำเร็จ ตรวจว่า Windows มี App Installer และเชื่อมต่ออินเทอร์เน็ต แล้วลองใหม่'
  ENGINE_CONFLICT = 'พบเครื่องเสมือนชื่อ TillumiPOS ที่ตั้งค่าไม่ตรงกัน ระบบไม่ได้เปลี่ยนข้อมูลเดิม กรุณาติดต่อผู้ดูแล'
}

function Ensure-Wsl {
  $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
  if ($wsl) {
    $previous = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; & $wsl.Source --status 2>&1 | Out-Null; $ready = $LASTEXITCODE -eq 0 }
    finally { $ErrorActionPreference = $previous }
    if ($ready) { return $true }
  }
  $answer = [Windows.Forms.MessageBox]::Show('เครื่องนี้ยังไม่พร้อมเปิดระบบ ต้องเปิดใช้งาน WSL และอาจต้องรีสตาร์ท Windows ต้องการเตรียมเครื่องตอนนี้หรือไม่? หลังรีสตาร์ทให้เข้าสู่บัญชี Windows เดิม ระบบจะทำต่ออัตโนมัติ', 'เตรียมคอมพิวเตอร์', 'YesNo', 'Question')
  if ($answer -eq 'Yes') {
    try {
      $process = Start-Process $powershell -Verb RunAs -WindowStyle Hidden -PassThru -Wait -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $program + '\enable-wsl.ps1"')
      $status.Text = if ($process.ExitCode -eq 3010) { 'กรุณาบันทึกงาน แล้วรีสตาร์ท Windows เพื่อทำต่อ' } else { 'เตรียมเครื่องไม่สำเร็จ กรุณาลองใหม่หรือติดต่อผู้ดูแล' }
    } catch { $status.Text = 'ยังไม่ได้รับสิทธิ์เตรียมเครื่อง กดเริ่มระบบเพื่อลองใหม่' }
  } else { $status.Text = 'กดเริ่มระบบเมื่อพร้อมเตรียมคอมพิวเตอร์' }
  $progress.Visible = $false
  return $false
}

function Repair-ShopNetwork([switch]$PreviouslyTrusted) {
  if (-not $script:result) { return }
  . "$program/payload/scripts/lan-address.ps1"
  if (-not $PreviouslyTrusted) {
    $answer = [Windows.Forms.MessageBox]::Show('ขณะนี้ต่อเครือข่ายของร้านที่คุณไว้ใจอยู่หรือไม่? ระบบจะอนุญาตเครื่องในเครือข่ายเดียวกันเข้าใช้ และเปลี่ยนเครือข่ายนี้เป็นส่วนตัว ห้ามใช้กับ Wi-Fi สาธารณะ', 'เชื่อมต่อเครื่องอื่น', 'YesNo', 'Question')
    if ($answer -ne 'Yes') { return }
  }
  try {
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $program + '\network.ps1" -Port ' + $script:result.Port
    if (-not $PreviouslyTrusted) { $arguments += ' -TrustShopNetwork' }
    $process = Start-Process $powershell -Verb RunAs -WindowStyle Hidden -PassThru -Wait -ArgumentList $arguments
    if ($process.ExitCode -ne 0) { throw 'NETWORK_FAILED' }
    # Consent is persisted, never setup codes or credentials.
    # Bind automatic repair to the trusted Windows network profile, not an arbitrary future Wi-Fi.
    $index = Get-DefaultRouteInterfaceIndex
    $profile = Get-NetConnectionProfile -InterfaceIndex $index
    Set-Content (Join-Path $shop 'lan-enabled') ([string]$profile.Name) -Encoding UTF8
    Update-LanStatus
  } catch { $lan.Text = 'ยังตั้งค่าเครือข่ายไม่สำเร็จ กดเชื่อมต่อเครื่องอื่นเพื่อลองใหม่' }
}

function Update-LanStatus {
  . "$program/payload/scripts/lan-address.ps1"
  $ip = Get-LanAddress
  $port = [string]$script:result.Port
  if ($ip -and (Test-LanReachable $ip $port)) {
    $lan.Text = "ที่อยู่สำหรับเครื่องอื่น: http://${ip}:$port`nเปิดที่อยู่นี้บน iPad หรือดู QR ในหน้าตั้งค่าร้าน"
  } else { $lan.Text = 'เครื่องนี้พร้อมใช้แล้ว กดเชื่อมต่อเครื่องอื่นเพื่อเปิดให้ iPad และเครื่องในร้าน' }
}

function Resume-ShopNetwork {
  . "$program/payload/scripts/lan-address.ps1"
  $saved = Join-Path $shop 'lan-enabled'
  if (-not (Test-Path $saved)) { return }
  $index = Get-DefaultRouteInterfaceIndex
  if (-not $index) { return }
  $profile = Get-NetConnectionProfile -InterfaceIndex $index -ErrorAction SilentlyContinue
  if (-not $profile -or $profile.NetworkCategory -eq 'Public' -or $profile.Name -cne (Get-Content $saved -Raw).Trim()) { return }
  $ip = Get-LanAddress
  $rule = Get-NetFirewallRule -DisplayName "TillumiPOS (TCP $($script:result.Port))" -ErrorAction SilentlyContinue
  if ($ip -and (-not $rule -or -not (Test-LanReachable $ip ([string]$script:result.Port)))) { Repair-ShopNetwork -PreviouslyTrusted }
}

function Start-Operation([string]$Action) {
  if ($script:process) { return }
  if ($Action -eq 'Start' -and -not (Ensure-Wsl)) { return }
  $script:action = $Action
  $retry.Enabled = $false
  $open.Enabled = $false
  $backup.Enabled = $false
  $network.Enabled = $false
  $stop.Enabled = $false
  $progress.Visible = $true
  $status.Text = switch ($Action) { 'Backup' { 'กำลังสำรองข้อมูล กรุณาหยุดขายชั่วคราว' }; 'Stop' { 'กำลังหยุดระบบร้าน...' }; default { 'กำลังเริ่มระบบ...' } }
  New-Item -ItemType Directory -Force $shop | Out-Null
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $powershell
  $info.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $program + '\worker.ps1" -Action ' + $Action
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $script:process = [Diagnostics.Process]::Start($info)
  $script:stdout = $script:process.StandardOutput.ReadToEndAsync()
  $script:stderr = $script:process.StandardError.ReadToEndAsync()
}

$timer = New-Object Windows.Forms.Timer
$timer.Interval = 750
$timer.Add_Tick({
  if (-not $script:process) { return }
  $last = Get-Content (Join-Path $shop 'launcher.log') -Tail 1 -ErrorAction SilentlyContinue
  if ($last) { $stage = ($last -split ' ')[-1]; if ($stages.ContainsKey($stage)) { $status.Text = $stages[$stage] } }
  if (-not $script:process.HasExited) { return }
  $reply = $null
  try { $reply = ($script:stdout.Result -split '\r?\n' | Where-Object { $_ -match '^\{"' } | Select-Object -Last 1) | ConvertFrom-Json } catch { }
  $script:process.Dispose()
  $script:process = $null
  $progress.Visible = $false
  $retry.Enabled = $true
  if (-not $reply -or -not $reply.Ok) {
    $code = if ($reply) { [string]$reply.Code } else { 'START_FAILED' }
    $status.Text = if ($errors.ContainsKey($code)) { $errors[$code] } else { $errors.START_FAILED }
    $detail.Text = 'บันทึกปัญหาไม่มีรหัสผ่าน ส่งบันทึกนี้ให้ผู้ดูแลได้ ข้อมูลร้านและไฟล์สำรองยังถูกเก็บไว้'
    return
  }
  if ($script:action -eq 'Start') {
    $script:result = $reply.Result
    $status.Text = 'พร้อมใช้งาน'
    $detail.Text = "รุ่น $($script:result.Version) · ปิดหน้าต่างนี้ได้ ระบบร้านยังทำงานอยู่`nระบบจะเริ่มอีกครั้งเมื่อเข้าสู่บัญชี Windows นี้"
    $setup.Text = if ($script:result.SetupCode) { "รหัสตั้งค่าร้านครั้งแรก: $($script:result.SetupCode)" } else { '' }
    Update-LanStatus
    Resume-ShopNetwork
    if (-not $AutoStart) { Start-Process $script:result.Url }
  } elseif ($script:action -eq 'Stop') {
    $script:result = $null
    $status.Text = 'หยุดระบบแล้ว'
    $detail.Text = 'ข้อมูลร้านยังอยู่ กดเริ่มระบบเมื่อพร้อมใช้งาน ระบบจะเปิดอีกครั้งเมื่อเข้าสู่ Windows'
    $setup.Text = ''
    $lan.Text = ''
    return
  } else { $status.Text = 'สำรองข้อมูลแล้ว'; $detail.Text = 'กดเปิดโฟลเดอร์สำรอง แล้วคัดลอกไฟล์ไปเก็บในอุปกรณ์อื่นด้วย' }
  $open.Enabled = $true
  $backup.Enabled = $true
  $network.Enabled = $true
  $stop.Enabled = $true
  if ($AutoStart) { $form.WindowState = 'Minimized' }
})
$form.Add_FormClosing({
  param($sender, $eventArgs)
  if ($script:process) {
    $eventArgs.Cancel = $true
    [Windows.Forms.MessageBox]::Show('โปรดรอให้การเริ่มระบบหรือสำรองข้อมูลเสร็จก่อนปิดหน้าต่าง', 'TillumiPOS') | Out-Null
  }
})
try {
  if ($PreviewPath) {
    $form.Show()
    $bitmap = New-Object Drawing.Bitmap($form.Width, $form.Height)
    $form.DrawToBitmap($bitmap, [Drawing.Rectangle]::new(0, 0, $form.Width, $form.Height))
    $bitmap.Save($PreviewPath)
    $bitmap.Dispose()
  } else {
    $form.Add_Shown({ $timer.Start(); Start-Operation 'Start' })
    [Windows.Forms.Application]::Run($form)
  }
} finally {
  $timer.Dispose()
  $form.Dispose()
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
