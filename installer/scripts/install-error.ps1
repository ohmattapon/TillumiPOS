# Shared by the scripts the installer runs hidden (first-install, configure-postgres-service,
# migrate-native). A hidden PowerShell window loses its error text, so every script writes the
# real reason next to the program, where installer/tillumi.iss reads it and shows it in its
# own dialog. The shop then sees "ทำ...ไม่สำเร็จ — <reason>" instead of only an exit code.
#
#   . (Join-Path $PSScriptRoot 'install-error.ps1')
#   Clear-InstallErrorLog $InstallDir
#   trap { Write-InstallErrorLog $InstallDir (Get-InstallErrorMessage $_); exit 1 }

function Clear-InstallErrorLog([string]$InstallDir) {
  if ([string]::IsNullOrEmpty($InstallDir)) { return }
  Remove-Item -LiteralPath (Join-Path $InstallDir 'install-error.txt') -Force -ErrorAction SilentlyContinue
}

function Write-InstallErrorLog([string]$InstallDir, [string]$Message) {
  # Never fail while reporting a failure: the exit code is what the installer acts on.
  try {
    if ([string]::IsNullOrEmpty($InstallDir)) { return }
    Set-Content -LiteralPath (Join-Path $InstallDir 'install-error.txt') -Value $Message -Encoding UTF8
  } catch { }
}

function Get-InstallErrorMessage($ErrorRecord) {
  $message = "$($ErrorRecord.Exception.Message)"
  $line = $ErrorRecord.InvocationInfo.ScriptLineNumber
  if ($line) { $message = "$message [line $line]" }
  return $message
}
