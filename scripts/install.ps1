# Installs EasyPOS with Docker Compose on Windows: writes .env with fresh secrets, starts it, prints the setup code.
#   .\scripts\install.ps1
#   .\scripts\install.ps1 -Domain pos.my.shop
param([string]$Domain = '')

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'Docker is not installed. Install Docker Desktop first: https://docs.docker.com/get-docker/'
}

function New-Secret([int]$Length) {
  $chars = [char[]]'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  -join (1..$Length | ForEach-Object { $chars[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($chars.Length)] })
}

if (Test-Path .env) {
  Write-Host '.env already exists: keeping it. Delete it first to make a fresh one.'
} else {
  $lines = @(
    '# Written by scripts/install.ps1. Keep this file private: it holds the secrets of this shop.',
    "POSTGRES_PASSWORD=$(New-Secret 32)",
    "JWT_SECRET=$(New-Secret 64)",
    'CHECKOUT_MODE=shifts',
    'PORT=3000'
  )
  if ($Domain) { $lines += "DOMAIN=$Domain"; $lines += 'COOKIE_SECURE=true' } else { $lines += 'COOKIE_SECURE=false' }
  Set-Content -Path .env -Value $lines -Encoding ascii
  Write-Host 'Wrote .env'
}

$envLines = Get-Content .env
$port = ($envLines | Where-Object { $_ -match '^PORT=' } | Select-Object -Last 1) -replace '^PORT=', ''
if (-not $port) { $port = '3000' }
$domainLine = $envLines | Where-Object { $_ -match '^DOMAIN=.+' } | Select-Object -Last 1
$composeArgs = @('-f', 'docker-compose.yml')
if ($domainLine) { $composeArgs += @('--profile', 'https'); $Domain = $domainLine -replace '^DOMAIN=', '' }

docker compose @composeArgs up -d --build
if ($LASTEXITCODE -ne 0) { Write-Error 'docker compose failed' }

Write-Host 'Waiting for the system to start...'
$up = $false
foreach ($attempt in 1..90) {
  try { Invoke-WebRequest -UseBasicParsing "http://localhost:$port/api/v1/health" | Out-Null; $up = $true; break }
  catch { Start-Sleep -Seconds 2 }
}
if (-not $up) { Write-Error 'The system did not start. See: docker compose logs app' }

$url = if ($Domain) { "https://$Domain" } else { "http://localhost:$port" }
Write-Host ''
Write-Host "EasyPOS is running: $url"
$log = docker compose -f docker-compose.yml logs app 2>$null | Out-String
$match = [regex]::Matches($log, 'SETUP CODE[^:]*:\s+([A-Z0-9]+)') | Select-Object -Last 1
if ($match) {
  Write-Host "First-time setup code: $($match.Groups[1].Value)"
  Write-Host 'Open the address above and enter this code to create the owner account.'
} else {
  Write-Host 'This shop is already set up: sign in at the address above.'
}
