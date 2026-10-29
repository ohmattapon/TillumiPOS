# This helper elevates system prerequisites only. Never initialize Podman under the administrator's account.
$ErrorActionPreference = 'Stop'
try {
  & "$env:SystemRoot/System32/wsl.exe" --install --no-distribution
  if ($LASTEXITCODE -notin @(0, 3010)) { exit 1 }
  exit 3010
} catch { exit 1 }
