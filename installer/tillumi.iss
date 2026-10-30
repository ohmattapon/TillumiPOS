; TillumiPOS native Windows installer (Task 3).
;
; ดับเบิลคลิกไฟล์เดียวจบ: วางโปรแกรม + ฐานข้อมูลในเครื่องร้าน เปิดเป็น
; Windows Service (เปิดเครื่องติดเอง ไม่ต้องล็อกอิน) สร้างทางลัดเปิดหน้าร้าน
; และงานสำรองข้อมูลทุกคืน ทุกข้อความที่ร้านเห็นเป็นภาษาไทยทั้งหมด
;
; วิธีสร้างไฟล์ติดตั้ง (ทำบนเครื่อง build ไม่ใช่เครื่องร้าน):
;   1. บิลด์ API:  bun build server/src/index.ts --compile --outfile <stage>\payload\app-<ver>\tillumi-pos.exe
;   2. บิลด์ตัวอัปฐานข้อมูล:
;      bun build server/src/infrastructure/database/migrate.ts --compile --outfile <stage>\payload\app-<ver>\tillumi-migrate.exe
;      (อ่านโฟลเดอร์ drizzle ผ่าน MIGRATIONS_DIR ดู server/src/infrastructure/database/migrations-folder.ts:
;      ในไฟล์ .exe ที่ compile แล้ว import.meta.url เป็น virtual path จึงหาตามไฟล์ไม่เจอ)
;   3. คัดหน้าเว็บ:  bunx vite build แล้วคัด dist\ เป็น <stage>\payload\app-<ver>\web\
;   4. คัด drizzle\ ทั้งโฟลเดอร์เป็น <stage>\payload\app-<ver>\drizzle\
;   5. โหลด PostgreSQL Windows binaries ตัวจริงจาก https://www.enterprisedb.com/download-postgresql-binaries
;      (พิสูจน์ด้วย 17.11: แตก zip แล้วคัดเฉพาะ pgsql\bin pgsql\lib pgsql\share
;      ไม่เอา pgAdmin/StackBuilder) ไว้ที่ <stage>\payload\pgsql\
;   6. โหลด WinSW v2 (พิสูจน์ด้วย v2.12.0 จาก https://github.com/winsw/winsw/releases)
;      ไฟล์เดียวชื่อ WinSW-x64.exe ไว้ที่ <stage>\payload\
;   7. (ไม่บังคับ) แอปหน้าต่างเดสก์ท็อป: bun run desktop:build จะได้ apps\desktop\release\win-unpacked\
;      (มี TillumiPOS.exe) ส่งโฟลเดอร์นั้นด้วย /DDesktopDir="<path>\win-unpacked" ตัวติดตั้งจะคัดทั้งโฟลเดอร์ไปที่
;      {app}\desktop\ และทางลัด "เปิดหน้าร้าน" จะเปิดแอปนั้น ถ้าไม่ส่ง /DDesktopDir จะไม่มีแอปในตัวติดตั้ง
;      และทางลัดเปิดเบราว์เซอร์ Chrome/Edge/เบราว์เซอร์ปกติเหมือนเดิม (ส่งโฟลเดอร์ที่ไม่มี TillumiPOS.exe คอมไพล์ไม่ผ่าน)
;   8. คอมไพล์: iscc /DPayloadDir="<stage>\payload" [/DDesktopDir="<path>\win-unpacked"] installer\tillumi.iss
;      (ไม่ส่ง /D จะใช้ installer\payload\ ซึ่ง CI เป็นคนเตรียมให้)
;
; ไฟล์ .exe ที่ได้ห้าม commit เข้า git เด็ดขาด (ออกที่ installer\output\ ซึ่งอยู่ใน .gitignore)
;
; สิ่งที่ตัวติดตั้งทำบนเครื่องร้าน (ต้องสิทธิ์แอดมินทั้งชุด):
;   1. วางไฟล์โปรแกรมที่ {app} (Program Files) แยกตามรุ่น app-<ver>\
;      ข้อมูลร้านอยู่แยกอีกที่ {commonappdata}\TillumiPOS (ProgramData) อัปเดต/ลงทับไม่มีวันแตะ
;   2. รัน scripts\first-install.ps1: สร้าง cluster ฐานข้อมูลใหม่ (ถ้ายังไม่มี)
;      เขียน .env พร้อมรหัสสุ่ม (ถ้ายังไม่มี) รันซ้ำได้ของเดิมไม่หาย
;   3. แทนที่ {{PLACEHOLDERS}} ใน xml ทั้งสองไฟล์ (install dir, data dir, app dir, พอร์ต 3000/5435)
;      แล้วตรวจว่าไม่เหลือ {{...}} จริงก่อนไปต่อ (ตามสัญญาใน installer\winsw\*.xml)
;   4. ติดตั้ง+สตาร์ท service tillumi-postgres แล้วรัน tillumi-migrate.exe
;      (อัปฐานข้อมูลข้ามรุ่นที่ยังไม่เคยอัปได้) แล้วค่อยติดตั้ง+สตาร์ท tillumi-pos
;      (service นี้ผูก tillumi-postgres ไว้ วินโดวส์จะสตาร์ทฐานข้อมูลก่อนเสมอ)
;   5. เปิดเบราว์เซอร์เช็คว่าหน้าร้านตอบจริง (หน้า /api/v1/setup อ่านตาราง users แปลว่าต่อฐานข้อมูลได้)
;   6. ถ้าติ๊กช่อง "ให้เครื่องอื่นในร้านใช้ด้วย": เปิด firewall เฉพาะพอร์ต 3000
;      ให้เฉพาะเน็ตเวิร์กส่วนตัว/บริษัท (Private, Domain) และเฉพาะเครื่องในวงแลนเดียวกัน
;      วายฟายที่มาร์กเป็น Public ยังปิดอยู่เหมือนเดิม (ระวังแบบเดียวกับ scripts\lan-address.ps1)
;   7. สร้างงาน "TillumiPOS nightly backup" รัน backup-native.ps1 ตีสองทุกคืน (สิทธิ์ SYSTEM)
;   8. ทางลัด "เปิดหน้าร้าน" (Chrome kiosk -> Edge kiosk -> เบราว์เซอร์ปกติ ตามที่มีในเครื่อง)
;
; ถอนการติดตั้ง: หยุด+ลบ service ลบงานสำรองข้อมูล ลบกฎ firewall แล้วถามก่อนเสมอว่า
; จะลบข้อมูลร้านด้วยหรือไม่ (ค่าเริ่มต้นคือเก็บไว้)
;
; ของที่พิสูจน์แล้วโดยไม่ต้องแอดมิน: สคริปต์คอมไพล์ผ่าน, แทนที่ placeholder ได้,
; first-install.ps1 รันจริง+รันซ้ำแล้วของเดิมอยู่ครบ, migrate+บูต API+เปิดหน้าเว็บได้จริงใน TEMP
; ของที่ต้องแอดมิน/เครื่องสะอาด (ยังไม่ได้ทดสอบ): ติดตั้ง service, รีบูตแล้วขายได้โดยไม่ล็อกอิน,
; งาน Task Scheduler, กฎ firewall, ถอนแบบเก็บ/ลบข้อมูล (มีขั้นตอนทดสอบท้ายไฟล์)

#define AppName "TillumiPOS"
#define AppVersion "1.0.0"
#ifndef PayloadDir
  #define PayloadDir SourcePath + "\\payload"
#endif
; DesktopDir ไม่มีค่าเริ่มต้นโดยตั้งใจ: ไม่ส่ง /DDesktopDir = ตัวติดตั้งไม่มีแอปเดสก์ท็อป (ห้ามส่งค่าว่าง)
#ifdef DesktopDir
  #if !FileExists(DesktopDir + "\\TillumiPOS.exe")
    #error "DesktopDir must be an existing folder that contains TillumiPOS.exe (the output of bun run desktop:build)"
  #endif
#endif
#define DataDirName "TillumiPOS"
#define PortApi "3000"
#define PortDb "5435"
#define FirewallRuleName AppName + " (TCP " + PortApi + ")"
#define BackupTaskName "TillumiPOS nightly backup"
#define ShopUrl "http://127.0.0.1:" + PortApi
; ใช้ 127.0.0.1 ตรง ๆ ไม่ใช้ localhost: บางเครื่องร้านแปลงชื่อ localhost แล้วค้าง (spike Task 1)

[Setup]
AppId={{F563D2AD-E57C-4D7E-A558-0AC5747C92CA}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppName}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
SolidCompression=yes
Compression=lzma2/max
SetupLogging=yes
WizardStyle=modern
ShowLanguageDialog=no
OutputDir=output
OutputBaseFilename={#AppName}-Setup-{#AppVersion}
VersionInfoVersion={#AppVersion}
UninstallDisplayName={#AppName}

[Languages]
Name: "thai"; MessagesFile: "compiler:Languages\Thai.isl"

[CustomMessages]
thai.TaskGroup=การเชื่อมต่อในร้าน
thai.TaskLan=ให้เครื่องอื่นในร้านเปิดหน้าขายได้ด้วย (เช่น iPad ผ่านวายฟายร้าน)
thai.OpenShopNow=เปิดหน้าร้านเลย
thai.ShowSetupCode=ดูรหัสสำหรับตั้งค่าร้านครั้งแรก

[Tasks]
Name: "lan"; Description: "{cm:TaskLan}"; GroupDescription: "{cm:TaskGroup}"

[Files]
; โปรแกรมรุ่นนี้ (exe + หน้าเว็บ + ไฟล์อัปฐานข้อมูล) แยกตามรุ่นไว้ rollback/อัปเดต (Task 4) ย้ายทีหลังได้
Source: "{#PayloadDir}\app-{#AppVersion}\*"; DestDir: "{app}\app-{#AppVersion}"; Flags: ignoreversion recursesubdirs createallsubdirs
; ฐานข้อมูล PostgreSQL (เฉพาะ bin/lib/share ที่รันจริง ไม่เอา pgAdmin/StackBuilder)
Source: "{#PayloadDir}\pgsql\*"; DestDir: "{app}\pgsql"; Flags: ignoreversion recursesubdirs createallsubdirs
; WinSW ตัวเดียว คัดเป็นสองชื่อให้ตรงกับ xml ของแต่ละ service (ห้าม commit ไบนารีลง git)
Source: "{#PayloadDir}\WinSW-x64.exe"; DestDir: "{app}"; DestName: "tillumi-postgres.exe"; Flags: ignoreversion
Source: "{#PayloadDir}\WinSW-x64.exe"; DestDir: "{app}"; DestName: "tillumi-pos.exe"; Flags: ignoreversion
; สคริปต์ของร้าน (first-install ใช้ครั้งเดียวตอนติดตั้ง อีกสองไฟล์งานสำรองข้อมูลเรียกทุกคืน)
Source: "scripts\*.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
; Publisher's public key: the only thing apply-update.ps1 trusts to say who signed an update. Installed here (admin-only)
; and never taken from an update package. A new key means a new setup .exe.
Source: "..\server\src\modules\update\update-public-key.json"; DestDir: "{app}"; Flags: ignoreversion
; ต้นแบบ xml มี {{...}} อยู่ เอาไปแทนค่าที่ {tmp} แล้วเขียนไฟล์จริงที่ {app} ใน [Code] (ห้ามติดตั้งตรง ๆ)
Source: "winsw\tillumi-postgres.xml"; DestDir: "{tmp}\tillumi-templates"; Flags: deleteafterinstall
Source: "winsw\tillumi-pos.xml"; DestDir: "{tmp}\tillumi-templates"; Flags: deleteafterinstall
#ifdef DesktopDir
; แอปหน้าต่างเดสก์ท็อป (Electron) ทั้งโฟลเดอร์ ติดตั้งเมื่อส่ง /DDesktopDir เท่านั้น แอปไม่เก็บรหัสลับใดเลย
Source: "{#DesktopDir}\*"; DestDir: "{app}\desktop"; Flags: ignoreversion recursesubdirs createallsubdirs
#endif

[Icons]
; ทางลัด "เปิดหน้าร้าน" เปิดแอปเดสก์ท็อปถ้ามี ไม่มีก็เลือกตามเบราว์เซอร์ที่มีในเครื่องตอนติดตั้ง (อันเดียวเท่านั้นที่ถูกสร้าง)
; แอปอ่านที่อยู่ร้านจากตัวแปร TILLUMI_SHOP_URL ถ้าไม่ตั้งใช้ http://127.0.0.1:3000 ซึ่งตรงกับ PortApi ที่นี่
; ถ้าร้านเปลี่ยนพอร์ต ช่างต้องตั้งตัวแปรนั้นเอง (ไม่ส่งทางบรรทัดคำสั่ง)
Name: "{autodesktop}\เปิดหน้าร้าน"; Filename: "{app}\desktop\TillumiPOS.exe"; WorkingDir: "{app}\desktop"; Check: HaveDesktopApp
Name: "{group}\เปิดหน้าร้าน"; Filename: "{app}\desktop\TillumiPOS.exe"; WorkingDir: "{app}\desktop"; Check: HaveDesktopApp
Name: "{autodesktop}\เปิดหน้าร้าน"; Filename: "{code:ChromePath}"; Parameters: "--kiosk {#ShopUrl}"; Check: HaveChrome
Name: "{autodesktop}\เปิดหน้าร้าน"; Filename: "{code:EdgePath}"; Parameters: "--kiosk {#ShopUrl}"; Check: HaveEdgeOnly
Name: "{autodesktop}\เปิดหน้าร้าน"; Filename: "{#ShopUrl}"; Check: HaveNoKioskBrowser
Name: "{group}\เปิดหน้าร้าน"; Filename: "{code:ChromePath}"; Parameters: "--kiosk {#ShopUrl}"; Check: HaveChrome
Name: "{group}\เปิดหน้าร้าน"; Filename: "{code:EdgePath}"; Parameters: "--kiosk {#ShopUrl}"; Check: HaveEdgeOnly
Name: "{group}\เปิดหน้าร้าน"; Filename: "{#ShopUrl}"; Check: HaveNoKioskBrowser
Name: "{group}\รหัสตั้งค่าร้าน"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\scripts\show-setup-code.ps1"" -DataDir ""{commonappdata}\{#DataDirName}"" -PortApi {#PortApi}"; IconFilename: "{sys}\shell32.dll"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\scripts\show-setup-code.ps1"" -DataDir ""{commonappdata}\{#DataDirName}"" -PortApi {#PortApi}"; Description: "{cm:ShowSetupCode}"; Flags: postinstall nowait skipifsilent; Check: InstalledSuccessfully
Filename: "{code:GetShopLink}"; Description: "{cm:OpenShopNow}"; Flags: postinstall nowait skipifsilent shellexec; Check: InstalledSuccessfully

[Code]
const
  PostgresService = 'tillumi-postgres';
  ApiService = 'tillumi-pos';

var
  FailedStep: String;
  HadPostgresService, HadApiService: Boolean;
  PostgresWasRunning, ApiWasRunning: Boolean;
  CreatedPostgresService, CreatedApiService, ServicesPrepared: Boolean;
  InstallationCompleted, RecoveryAttempted: Boolean;

function InstalledSuccessfully(): Boolean;
begin
  Result := InstallationCompleted;
end;

function DataDirPath(): String;
begin
  Result := ExpandConstant('{commonappdata}\{#DataDirName}');
end;

function AppVerDir(): String;
begin
  Result := ExpandConstant('{app}\app-{#AppVersion}');
end;

function ChromePath(Param: String): String;
begin
  Result := ExpandConstant('{pf}\Google\Chrome\Application\chrome.exe');
  if not FileExists(Result) then
    Result := ExpandConstant('{pf32}\Google\Chrome\Application\chrome.exe');
end;

function EdgePath(Param: String): String;
begin
  Result := ExpandConstant('{pf}\Microsoft\Edge\Application\msedge.exe');
  if not FileExists(Result) then
    Result := ExpandConstant('{pf32}\Microsoft\Edge\Application\msedge.exe');
end;

// True only when this installer carried the desktop app (/DDesktopDir) and it is on disk. Tested at run time,
// so an installer built without the app, or an app that failed to copy, falls back to the browser shortcuts.
function HaveDesktopApp(): Boolean;
begin
  Result := FileExists(ExpandConstant('{app}\desktop\TillumiPOS.exe'));
end;

// The three browser checks are false when the desktop app is there, so each place gets exactly one shortcut.
function HaveChrome(): Boolean;
begin
  Result := (not HaveDesktopApp()) and FileExists(ChromePath(''));
end;

function HaveEdgeOnly(): Boolean;
begin
  Result := (not HaveDesktopApp()) and (not FileExists(ChromePath(''))) and FileExists(EdgePath(''));
end;

function HaveNoKioskBrowser(): Boolean;
begin
  Result := (not HaveDesktopApp()) and (not FileExists(ChromePath(''))) and (not FileExists(EdgePath('')));
end;

function GetShopLink(Param: String): String;
begin
  if HaveDesktopApp() then
    Result := ExpandConstant('{app}\desktop\TillumiPOS.exe')
  else
    Result := ExpandConstant('{autodesktop}\เปิดหน้าร้าน.lnk');
end;

function RunHidden(const Exe, Params, WorkDir: String; var ExitCode: Integer): Boolean;
begin
  Result := Exec(Exe, Params, WorkDir, SW_HIDE, ewWaitUntilTerminated, ExitCode);
end;

procedure MustRun(const Exe, Params, WorkDir, StepName: String);
var
  ExitCode: Integer;
begin
  FailedStep := StepName;
  if not RunHidden(Exe, Params, WorkDir, ExitCode) then
    RaiseException('ทำ' + StepName + 'ไม่สำเร็จ (เรียกโปรแกรมไม่ได้) ลองติดตั้งอีกครั้ง หากยังไม่ได้ โปรดติดต่อช่าง');
  if ExitCode <> 0 then
    RaiseException('ทำ' + StepName + 'ไม่สำเร็จ (รหัส ' + IntToStr(ExitCode) + ') ลองติดตั้งอีกครั้ง หากยังไม่ได้ โปรดติดต่อช่าง');
end;

procedure StopAndRemoveServices();
var
  ExitCode: Integer;
begin
  RunHidden(ExpandConstant('{sys}\net.exe'), 'stop ' + ApiService, '', ExitCode);
  RunHidden(ExpandConstant('{app}\tillumi-pos.exe'), 'uninstall', ExpandConstant('{app}'), ExitCode);
  RunHidden(ExpandConstant('{sys}\net.exe'), 'stop ' + PostgresService, '', ExitCode);
  RunHidden(ExpandConstant('{app}\tillumi-postgres.exe'), 'uninstall', ExpandConstant('{app}'), ExitCode);
end;

function ServiceExists(const Name: String): Boolean;
var
  ExitCode: Integer;
begin
  Result := RunHidden(ExpandConstant('{sys}\sc.exe'), 'query ' + Name, '', ExitCode);
  if Result then Result := ExitCode = 0;
end;

function ServiceRunning(const Name: String): Boolean;
var
  ExitCode: Integer;
begin
  Result := RunHidden('powershell.exe', '-NoProfile -Command "if ((Get-Service -Name ''' + Name + ''').Status -eq ''Running'') { exit 0 } else { exit 1 }"', '', ExitCode);
  if Result then Result := ExitCode = 0;
end;

procedure RecoverPreviousServices();
var
  ExitCode: Integer;
begin
  if RecoveryAttempted then Exit;
  RecoveryAttempted := True;
  { Remove only services created by THIS attempt. Existing shops keep their registrations. }
  if ServicesPrepared then
  begin
    if HadApiService then RunHidden(ExpandConstant('{sys}\net.exe'), 'stop ' + ApiService, '', ExitCode);
    if HadPostgresService then RunHidden(ExpandConstant('{sys}\net.exe'), 'stop ' + PostgresService, '', ExitCode);
  end;
  if CreatedApiService then
  begin
    RunHidden(ExpandConstant('{sys}\net.exe'), 'stop ' + ApiService, '', ExitCode);
    RunHidden(ExpandConstant('{app}\tillumi-pos.exe'), 'uninstall', ExpandConstant('{app}'), ExitCode);
  end;
  if CreatedPostgresService then
  begin
    RunHidden(ExpandConstant('{sys}\net.exe'), 'stop ' + PostgresService, '', ExitCode);
    RunHidden(ExpandConstant('{app}\tillumi-postgres.exe'), 'uninstall', ExpandConstant('{app}'), ExitCode);
  end;
  if HadApiService and FileExists(ExpandConstant('{tmp}\tillumi-old-api.xml')) then
    FileCopy(ExpandConstant('{tmp}\tillumi-old-api.xml'), ExpandConstant('{app}\tillumi-pos.xml'), False);
  if HadPostgresService and FileExists(ExpandConstant('{tmp}\tillumi-old-postgres.xml')) then
    FileCopy(ExpandConstant('{tmp}\tillumi-old-postgres.xml'), ExpandConstant('{app}\tillumi-postgres.xml'), False);
  if PostgresWasRunning then RunHidden(ExpandConstant('{sys}\net.exe'), 'start ' + PostgresService, '', ExitCode);
  if ApiWasRunning then RunHidden(ExpandConstant('{sys}\net.exe'), 'start ' + ApiService, '', ExitCode);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if ServicesPrepared then Exit;
  RecoveryAttempted := False;
  HadPostgresService := ServiceExists(PostgresService);
  HadApiService := ServiceExists(ApiService);
  PostgresWasRunning := HadPostgresService and ServiceRunning(PostgresService);
  ApiWasRunning := HadApiService and ServiceRunning(ApiService);
  try
    if HadApiService and (not FileCopy(ExpandConstant('{app}\tillumi-pos.xml'), ExpandConstant('{tmp}\tillumi-old-api.xml'), False)) then
      RaiseException('เก็บไฟล์ตั้งค่าระบบเดิมไม่สำเร็จ ยังไม่ได้เปลี่ยนไฟล์ร้าน');
    if HadPostgresService and (not FileCopy(ExpandConstant('{app}\tillumi-postgres.xml'), ExpandConstant('{tmp}\tillumi-old-postgres.xml'), False)) then
      RaiseException('เก็บไฟล์ตั้งค่าฐานข้อมูลเดิมไม่สำเร็จ ยังไม่ได้เปลี่ยนไฟล์ร้าน');
    { Stop before copying binaries, rather than after Inno has replaced them. }
    if HadApiService then
      MustRun('powershell.exe', '-NoProfile -Command "Stop-Service tillumi-pos -ErrorAction Stop; (Get-Service tillumi-pos).WaitForStatus(''Stopped'', [TimeSpan]::FromSeconds(60))"', '', 'หยุดหน้าร้านเดิม');
    if HadPostgresService then
      MustRun('powershell.exe', '-NoProfile -Command "Stop-Service tillumi-postgres -ErrorAction Stop; (Get-Service tillumi-postgres).WaitForStatus(''Stopped'', [TimeSpan]::FromSeconds(60))"', '', 'หยุดฐานข้อมูลเดิม');
    ServicesPrepared := True;
  except
    Result := GetExceptionMessage();
    RecoverPreviousServices();
  end;
end;

procedure WriteServiceXml(const TemplateName, DestName: String);
var
  Cmd: String;
  ExitCode: Integer;
begin
  { แทนที่ด้วย PowerShell (ไม่ใช่ StringChangeEx) เพื่อให้ไฟล์ยังเป็น UTF-8 ไม่มี BOM เหมือนเดิม:
    ถ้าเขียนด้วย Pascal ตรง ๆ ตัวอักษรพิเศษในคอมเมนต์อาจเสีย }
  Cmd := '-NoProfile -ExecutionPolicy Bypass -Command "'
    + '$x = Get-Content -Raw -LiteralPath ''' + ExpandConstant('{tmp}\tillumi-templates\' + TemplateName) + '''; '
    + '$x = $x.Replace(''{{INSTALL_DIR}}'', ''' + ExpandConstant('{app}') + '''); '
    + '$x = $x.Replace(''{{DATA_DIR}}'', ''' + DataDirPath() + '''); '
    + '$x = $x.Replace(''{{APP_DIR}}'', ''' + AppVerDir() + '''); '
    + '$x = $x.Replace(''{{APP_EXE}}'', ''' + AppVerDir() + '\tillumi-pos.exe''); '
    + '$x = $x.Replace(''{{PORT_API}}'', ''{#PortApi}''); '
    + '$x = $x.Replace(''{{PORT_DB}}'', ''{#PortDb}''); '
    + 'if ($x -match ''\{\{[A-Z_]+\}\}'') { exit 11 }; '
    + '[IO.File]::WriteAllText(''' + ExpandConstant('{app}\' + DestName) + ''', $x, [Text.UTF8Encoding]::new($false))"';
  FailedStep := 'เตรียมไฟล์ service ' + DestName;
  if not RunHidden('powershell.exe', Cmd, ExpandConstant('{tmp}'), ExitCode) then
    RaiseException('ทำ' + FailedStep + 'ไม่สำเร็จ (เรียกโปรแกรมไม่ได้) ลองติดตั้งอีกครั้ง หากยังไม่ได้ โปรดติดต่อช่าง');
  if ExitCode = 11 then
    RaiseException('ไฟล์ ' + DestName + ' ยังมีช่องว่างที่ไม่ได้กรอก เหลืออยู่ กรุณาแจ้งช่าง (รหัส 11)');
  if ExitCode <> 0 then
    RaiseException('ทำ' + FailedStep + 'ไม่สำเร็จ (รหัส ' + IntToStr(ExitCode) + ') ลองติดตั้งอีกครั้ง หากยังไม่ได้ โปรดติดต่อช่าง');
end;

procedure WaitForShop();
var
  Cmd: String;
  ExitCode: Integer;
begin
  { หน้า /api/v1/setup อ่านตาราง users แปลว่าต่อฐานข้อมูลที่อัปแล้วได้จริง ไม่ใช่แค่โปรแกรมติด }
  Cmd := '-NoProfile -ExecutionPolicy Bypass -Command "'
    + 'for ($i = 0; $i -lt 30; $i++) { '
    + 'try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 ''{#ShopUrl}/api/v1/setup''; '
    + 'if ($r.StatusCode -eq 200) { exit 0 } } catch { }; '
    + 'Start-Sleep -Seconds 2 }; exit 1"';
  FailedStep := 'รอหน้าร้านตอบ';
  if not RunHidden('powershell.exe', Cmd, ExpandConstant('{tmp}'), ExitCode) then
    RaiseException('ทำ' + FailedStep + 'ไม่สำเร็จ (เรียกโปรแกรมไม่ได้) ลองติดตั้งอีกครั้ง หากยังไม่ได้ โปรดติดต่อช่าง');
  if ExitCode <> 0 then
    RaiseException('ติดตั้งไฟล์เสร็จแล้วแต่เปิดหน้าร้านไม่ติด ลองเปิดเครื่องใหม่แล้วเปิดทางลัด "เปิดหน้าร้าน" หากยังไม่ได้ โปรดติดต่อช่าง');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ExitCode: Integer;
begin
  if CurStep <> ssPostInstall then
    Exit;

  try
    { 1. ฐานข้อมูล + รหัส: รันซ้ำได้ ของเดิมไม่หาย }
    MustRun('powershell.exe',
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\first-install.ps1') + '"'
      + ' -InstallDir "' + ExpandConstant('{app}') + '"'
      + ' -DataDir "' + DataDirPath() + '"'
      + ' -PgsqlDir "' + ExpandConstant('{app}\pgsql') + '"'
      + ' -PortDb {#PortDb} -PortApi {#PortApi}',
      ExpandConstant('{tmp}'),
      'เตรียมฐานข้อมูลของร้าน');

    { 2. ไฟล์ service ทั้งสอง (ตรวจว่าไม่เหลือ token ค้างทุกไฟล์) }
    WriteServiceXml('tillumi-postgres.xml', 'tillumi-postgres.xml');
    WriteServiceXml('tillumi-pos.xml', 'tillumi-pos.xml');

    { 3. ฐานข้อมูลก่อน แล้วอัปตาราง แล้วค่อยตัวร้าน (ผูกลำดับไว้ใน xml ด้วย <depend>) }
    if not HadPostgresService then
    begin
      MustRun(ExpandConstant('{app}\tillumi-postgres.exe'), 'install', ExpandConstant('{app}'), 'ติดตั้ง service ฐานข้อมูล');
      CreatedPostgresService := True;
    end;
    MustRun('powershell.exe',
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\configure-postgres-service.ps1') + '" -InstallDir "' + ExpandConstant('{app}') + '" -DataDir "' + DataDirPath() + '"',
      DataDirPath(), 'กำหนดสิทธิ์บัญชีฐานข้อมูล');
    MustRun(ExpandConstant('{sys}\net.exe'), 'start ' + PostgresService, '', 'สตาร์ทฐานข้อมูล');
    MustRun('powershell.exe',
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\migrate-native.ps1') + '" -AppDir "' + AppVerDir() + '" -DataDir "' + DataDirPath() + '" -PortDb {#PortDb}',
      DataDirPath(),
      'อัปฐานข้อมูลให้เป็นรุ่นล่าสุด');
    if not HadApiService then
    begin
      MustRun(ExpandConstant('{app}\tillumi-pos.exe'), 'install', ExpandConstant('{app}'), 'ติดตั้ง service หน้าร้าน');
      CreatedApiService := True;
    end;
    MustRun(ExpandConstant('{sys}\net.exe'), 'start ' + ApiService, '', 'สตาร์ทหน้าร้าน');

    { 4. หน้าร้านต้องตอบจริงจึงนับว่าเสร็จ }
    WaitForShop();

    { 5. ติ๊กช่อง LAN: เปิดแค่พอร์ตขายของ ให้เฉพาะเน็ตส่วนตัว/บริษัทและเครื่องในวงเดียวกัน }
    if WizardIsTaskSelected('lan') then
      MustRun(ExpandConstant('{sys}\netsh.exe'),
        'advfirewall firewall add rule name="{#FirewallRuleName}" dir=in action=allow protocol=TCP localport={#PortApi} profile=private,domain remoteip=localsubnet',
        '', 'เปิดให้เครื่องอื่นในร้านเชื่อมต่อ');

    { 6. งานสำรองข้อมูลตีสองทุกคืน }
    MustRun(ExpandConstant('{sys}\schtasks.exe'),
      '/create /tn "{#BackupTaskName}"'
      + ' /tr "\"powershell.exe\" -NoProfile -ExecutionPolicy Bypass -File \"' + ExpandConstant('{app}\scripts\backup-native.ps1') + '\" -PgsqlBinDir \"' + ExpandConstant('{app}\pgsql\bin') + '\" -DataDir \"' + DataDirPath() + '\""'
      + ' /sc daily /st 02:00 /ru SYSTEM /f',
      '', 'ตั้งงานสำรองข้อมูลทุกคืน');
    InstallationCompleted := True;
  except
    RecoverPreviousServices();
    RaiseException(GetExceptionMessage());
  end;
end;

procedure DeinitializeSetup();
begin
  { Also recover when copying files fails or setup is cancelled after preparation. }
  if ServicesPrepared and (not InstallationCompleted) then RecoverPreviousServices();
end;

procedure CurUninstallStepChanged(CurStep: TUninstallStep);
var
  ExitCode: Integer;
  Ask: String;
begin
  if CurStep = usUninstall then
  begin
    StopAndRemoveServices();
    RunHidden(ExpandConstant('{sys}\schtasks.exe'), '/delete /tn "{#BackupTaskName}" /f', '', ExitCode);
    RunHidden(ExpandConstant('{sys}\netsh.exe'), 'advfirewall firewall delete rule name="{#FirewallRuleName}"', '', ExitCode);
  end;

  if CurStep = usPostUninstall then
  begin
    { ค่าเริ่มต้นคือเก็บไว้: ปุ่ม "ใช่" (ค่าเริ่มต้น) = เก็บ, "ไม่ใช่" = ลบถาวร }
    Ask := 'เก็บข้อมูลของร้านไว้หรือไม่?' + #13#10 + #13#10
      + 'ยอดขาย สินค้า รูปสินค้า และไฟล์สำรองทั้งหมดจะยังอยู่ ติดตั้งครั้งหน้ากลับมาใช้ต่อได้ทันที' + #13#10 + #13#10
      + 'กด "ใช่" = เก็บไว้ (แนะนำ)' + #13#10
      + 'กด "ไม่ใช่" = ลบทิ้งทั้งหมด กู้คืนไม่ได้';
    if MsgBox(Ask, mbConfirmation, MB_YESNO) = IDNO then
      DelTree(DataDirPath(), True, True, True);
  end;
end;

{ ขั้นตอนทดสอบบนเครื่องสะอาด/VM (ต้องสิทธิ์แอดมิน ยังไม่ได้ทำ):
    1. ดับเบิลคลิกไฟล์ติดตั้ง กด Next ตาม wizard ภาษาไทย (ติ๊ก/ไม่ติ๊กช่อง LAN อย่างละรอบ)
    2. ติ๊ก "เปิดหน้าร้านเลย" ขาย 1 บิลได้ แล้วรีบูต: ไม่ต้องล็อกอิน เปิดทางลัดขายต่อได้
    3. ถอนการติดตั้งเลือก "ใช่" (เก็บข้อมูล) แล้วติดตั้งซ้ำ: ยอดขายเดิมยังอยู่
    4. ถอนการติดตั้งเลือก "ไม่ใช่" (ลบ): โฟลเดอร์ ProgramData\TillumiPOS หาย
    5. งานสำรองข้อมูลรันตีสองแล้วได้ไฟล์ .sql.gz ใน backups }
