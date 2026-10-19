#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef StageDirectory
  #error StageDirectory is required
#endif
#ifndef OutputDirectory
  #error OutputDirectory is required
#endif

[Setup]
AppId={{0B255671-1773-47B1-A2AA-78E77CE58822}
AppName=TillumiPOS
AppVersion={#AppVersion}
AppPublisher=TillumiPOS
DefaultDirName={localappdata}\TillumiPOS\program
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0.22000
OutputDir={#OutputDirectory}
OutputBaseFilename=TillumiPOS-Setup-{#AppVersion}
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
AppMutex=Local\TillumiPOS.Control
UninstallDisplayName=TillumiPOS (เก็บข้อมูลร้านไว้)

[Languages]
Name: "thai"; MessagesFile: "compiler:Default.isl"

[LangOptions]
LanguageName=ไทย
LanguageID=$041E
LanguageCodePage=874
DialogFontName=Tahoma
DialogFontSize=10
WelcomeFontName=Tahoma
TitleFontName=Tahoma

[Messages]
SetupAppTitle=ติดตั้ง
SetupWindowTitle=ติดตั้ง - %1
UninstallAppTitle=ถอนการติดตั้ง
UninstallAppFullTitle=ถอนการติดตั้ง %1
InformationTitle=ข้อมูล
ConfirmTitle=ยืนยัน
ErrorTitle=ข้อผิดพลาด
ButtonBack=< ย้อนกลับ
ButtonNext=ถัดไป >
ButtonInstall=ติดตั้ง
ButtonOK=ตกลง
ButtonCancel=ยกเลิก
ButtonYes=ใช่
ButtonNo=ไม่ใช่
ButtonFinish=เสร็จสิ้น
SetupAlreadyRunning=ตัวติดตั้งกำลังเปิดอยู่แล้ว
SetupFileCorrupt=ไฟล์ติดตั้งเสียหาย กรุณาดาวน์โหลดตัวติดตั้งใหม่
WindowsVersionNotSupported=โปรแกรมนี้รองรับ Windows 11 แบบ x64 เท่านั้น
SetupAppRunningError=กำลังเปิด %1 อยู่%n%nกรุณาปิดหน้าต่างควบคุมและรอการเริ่มระบบหรือสำรองข้อมูลให้เสร็จก่อน แล้วกดตกลงเพื่อลองใหม่
UninstallAppRunningError=กำลังเปิด %1 อยู่%n%nกรุณาปิดหน้าต่างควบคุมและรอการสำรองข้อมูลให้เสร็จก่อน แล้วกดตกลงเพื่อลองใหม่
ExitSetupTitle=ออกจากตัวติดตั้ง
ExitSetupMessage=ยังติดตั้งไม่เสร็จ หากออกตอนนี้ โปรแกรมจะยังไม่พร้อมใช้งาน%n%nต้องการออกจากตัวติดตั้งหรือไม่?
WizardReady=พร้อมติดตั้ง
ReadyLabel1=พร้อมติดตั้ง [name] บนคอมพิวเตอร์เครื่องนี้
ReadyLabel2a=กดติดตั้งเพื่อดำเนินการต่อ หรือกดย้อนกลับเพื่อตรวจสอบการตั้งค่า
ReadyLabel2b=กดติดตั้งเพื่อดำเนินการต่อ
ReadyMemoDir=โฟลเดอร์โปรแกรม:
ReadyMemoGroup=โฟลเดอร์เมนูเริ่ม:
WizardPreparing=กำลังเตรียมติดตั้ง
PreparingDesc=กำลังเตรียมติดตั้ง [name] บนคอมพิวเตอร์เครื่องนี้
WizardInstalling=กำลังติดตั้ง
InstallingLabel=กรุณารอขณะติดตั้ง [name]
StatusExtractFiles=กำลังคัดลอกไฟล์...
StatusCreateIcons=กำลังสร้างทางลัด...
StatusCreateIniEntries=กำลังบันทึกการตั้งค่า...
StatusCreateRegistryEntries=กำลังตั้งค่าการเปิดระบบ...
StatusSavingUninstall=กำลังบันทึกข้อมูลสำหรับถอนการติดตั้ง...
FinishedHeadingLabel=ติดตั้ง [name] เรียบร้อยแล้ว
FinishedLabel=ติดตั้ง [name] แล้ว เปิดโปรแกรมจากทางลัดบนหน้าจอหรือเมนูเริ่มเพื่อเตรียมระบบร้าน%n%nครั้งแรกต้องเชื่อมต่ออินเทอร์เน็ต และอาจต้องอนุญาตให้เตรียม WSL พร้อมรีสตาร์ท Windows
FinishedLabelNoIcons=ติดตั้ง [name] แล้ว
ConfirmUninstall=ต้องการถอนการติดตั้ง %1 หรือไม่?%n%nข้อมูลร้าน รหัสผ่าน และข้อมูลสำรองจะยังถูกเก็บไว้
WizardUninstalling=กำลังถอนการติดตั้ง
UninstallStatusLabel=กรุณารอขณะถอนการติดตั้ง %1
StatusUninstalling=กำลังถอนการติดตั้ง %1...
UninstalledAll=ถอนการติดตั้ง %1 แล้ว ข้อมูลร้านและข้อมูลสำรองยังถูกเก็บไว้

[Files]
Source: "{#StageDirectory}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\TillumiPOS"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher.ps1"""; WorkingDir: "{app}"
Name: "{autodesktop}\TillumiPOS"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher.ps1"""; WorkingDir: "{app}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "TillumiPOS"; ValueData: """{sys}\WindowsPowerShell\v1.0\powershell.exe"" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher.ps1"" -AutoStart"; Flags: uninsdeletevalue

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher.ps1"""; Description: "เปิด TillumiPOS"; Flags: nowait postinstall skipifsilent runasoriginaluser

[Code]
function CreateFileW(FileName: String; DesiredAccess, ShareMode: Cardinal;
  SecurityAttributes: Integer; CreationDisposition, FlagsAndAttributes: Cardinal;
  TemplateFile: THandle): THandle;
  external 'CreateFileW@kernel32.dll stdcall';
function CloseHandle(Handle: THandle): Boolean;
  external 'CloseHandle@kernel32.dll stdcall';

function HasActiveOperation(): Boolean;
var
  LockPath: String;
  Handle: THandle;
begin
  Result := False;
  LockPath := ExpandConstant('{localappdata}\TillumiPOS\shop\operation.lock');
  if FileExists(LockPath) then
  begin
    Handle := CreateFileW(LockPath, $80000000, 0, 0, 3, $80, 0);
    Result := Handle = THandle(-1);
    if not Result then CloseHandle(Handle);
  end;
end;

function HasActiveShopProcess(): Boolean;
var
  Locator, Services, Processes, Process: Variant;
  I: Integer;
  CommandLine, ProgramPath: String;
begin
  Result := CheckForMutexes('Local\TillumiPOS.Control') or HasActiveOperation();
  if Result then Exit;
  ProgramPath := Lowercase(ExpandConstant('{app}'));
  Locator := CreateOleObject('WbemScripting.SWbemLocator');
  Services := Locator.ConnectServer('', 'root\CIMV2');
  Processes := Services.ExecQuery('SELECT CommandLine FROM Win32_Process WHERE Name = ''powershell.exe'' OR Name = ''pwsh.exe''');
  for I := 0 to Processes.Count - 1 do
  begin
    Process := Processes.ItemIndex(I);
    if not VarIsNull(Process.CommandLine) then
    begin
      CommandLine := Process.CommandLine;
      CommandLine := Lowercase(CommandLine);
      if (Pos(ProgramPath, CommandLine) > 0) and
         ((Pos('launcher.ps1', CommandLine) > 0) or (Pos('worker.ps1', CommandLine) > 0)) then
      begin
        Result := True;
        Exit;
      end;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  try
    if HasActiveShopProcess() then
      Result := 'กรุณาปิดหน้าต่างควบคุม TillumiPOS และรอการเริ่มระบบหรือสำรองข้อมูลให้เสร็จก่อน แล้วลองใหม่';
  except
    Result := 'ตรวจสอบสถานะ TillumiPOS ไม่สำเร็จ กรุณารีสตาร์ท Windows แล้วลองติดตั้งใหม่';
  end;
end;

function InitializeUninstall(): Boolean;
begin
  Result := False;
  try
    if HasActiveShopProcess() then
      MsgBox('กรุณาปิด TillumiPOS และรอการสำรองข้อมูลให้เสร็จก่อนถอนการติดตั้ง ข้อมูลร้านจะยังถูกเก็บไว้', mbError, MB_OK)
    else Result := True;
  except
    MsgBox('ตรวจสอบสถานะ TillumiPOS ไม่สำเร็จ กรุณารีสตาร์ท Windows แล้วลองถอนการติดตั้งใหม่', mbError, MB_OK);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ExitCode: Integer;
  Stopped: Boolean;
begin
  if CurUninstallStep <> usAppMutexCheck then Exit;
  { This phase is after uninstall confirmation, before any program files are removed. }
  if HasActiveShopProcess() then
  begin
    MsgBox('TillumiPOS ยังทำงานอยู่ กรุณาปิดหน้าควบคุมและลองใหม่', mbError, MB_OK);
    Abort;
  end;
  if not FileExists(ExpandConstant('{app}\worker.ps1')) then Exit;
  Stopped := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\worker.ps1') + '" -Action Stop',
    ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ExitCode);
  if not Stopped or (ExitCode <> 0) then
  begin
    MsgBox('หยุดระบบร้านไม่สำเร็จ ยังไม่ได้ถอนการติดตั้ง กรุณาลองใหม่หรือติดต่อผู้ดูแล', mbError, MB_OK);
    Abort;
  end;
end;