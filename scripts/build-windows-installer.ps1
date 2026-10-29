param(
    [string]$Version,
    [string]$ImageArchive,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../dist-installer'),
    [string]$IsccPath = "${env:ProgramFiles(x86)}/Inno Setup 6/ISCC.exe"
)
$ErrorActionPreference = 'Stop'

function Assert-PackageVersion([string]$Value) {
    if ($Value -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') { throw 'Version must be numeric x.y.z without leading zeros' }
    foreach ($part in $Value.Split('.')) { if ([decimal]$part -gt 65535) { throw 'Version components must be at most 65535' } }
}

function ConvertTo-PackagedCompose([string]$Canonical, [string]$Image) {
    if ($Image -notmatch '^localhost/tillumipos:[0-9]+\.[0-9]+\.[0-9]+$') { throw 'Invalid image name' }
    $pattern = '(?m)(^  app:\r?\n)    build: \.(\r?$)'
    if ([regex]::Matches($Canonical, $pattern).Count -ne 1) { throw 'Canonical app build changed; review packaging conversion' }
    return [regex]::Replace($Canonical, $pattern, ('${1}    image: ' + $Image + '${2}'))
}

function Read-ArchiveJson([string]$Archive, [string]$Entry) {
    $json = & tar -xOf $Archive $Entry 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $json) { throw "Archive is missing $Entry" }
    return ($json -join "`n" | ConvertFrom-Json)
}

function Assert-ImageArchive([string]$Archive, [string]$Image) {
    if (-not (Test-Path -LiteralPath $Archive -PathType Leaf)) { throw 'Image archive does not exist' }
    $entries = @(Read-ArchiveJson $Archive 'manifest.json')
    if ($entries.Count -ne 1 -or @($entries[0].RepoTags).Count -ne 1 -or $entries[0].RepoTags[0] -cne $Image) {
        throw "Archive must contain only $Image (podman save --format docker-archive)"
    }
    $config = [string]$entries[0].Config
    if ($config -notmatch '^[a-zA-Z0-9/_.-]+$' -or $config.Contains('..') -or $config.StartsWith('/')) { throw 'Unsafe archive config entry' }
    $metadata = Read-ArchiveJson $Archive $config
    if ($metadata.os -cne 'linux' -or $metadata.architecture -cne 'amd64') { throw 'App image must target linux/amd64' }
}

function Build-WindowsInstaller {
    Assert-PackageVersion $Version
    $archive = (Resolve-Path -LiteralPath $ImageArchive -ErrorAction Stop).Path
    $image = "localhost/tillumipos:$Version"
    Assert-ImageArchive $archive $image
    if (-not (Test-Path -LiteralPath $IsccPath -PathType Leaf)) { throw 'Inno Setup 6 compiler not found; specify -IsccPath' }
    $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $output = [IO.Path]::GetFullPath($OutputDirectory)
    $stage = Join-Path $output ('stage-' + [guid]::NewGuid().ToString('N'))
    $program = Join-Path $stage 'program'
    $payload = Join-Path $program 'payload'
    New-Item -ItemType Directory -Path (Join-Path $payload 'scripts') -Force | Out-Null
    # Deliberate allowlist: never recursively copy a checkout or a shop directory.
    foreach ($script in @('launcher', 'runtime', 'worker', 'network', 'enable-wsl')) {
        Copy-Item -LiteralPath (Join-Path $repo "installer/windows/$script.ps1") -Destination $program
    }
    foreach ($script in @('podman-windows', 'lan-address')) {
        Copy-Item -LiteralPath (Join-Path $repo "scripts/$script.ps1") -Destination (Join-Path $payload 'scripts')
    }
    Copy-Item -LiteralPath (Join-Path $repo 'LICENSE') -Destination $program
    Copy-Item -LiteralPath (Join-Path $repo 'Caddyfile') -Destination $payload
    Copy-Item -LiteralPath $archive -Destination (Join-Path $payload 'app-image.tar')
    $compose = ConvertTo-PackagedCompose ([IO.File]::ReadAllText((Join-Path $repo 'docker-compose.yml'))) $image
    [IO.File]::WriteAllText((Join-Path $payload 'docker-compose.yml'), $compose, (New-Object Text.UTF8Encoding($false)))
    $manifest = [ordered]@{
        version = $Version
        image = $image
        sha256 = (Get-FileHash -LiteralPath (Join-Path $payload 'app-image.tar') -Algorithm SHA256).Hash.ToLowerInvariant()
        composeSha256 = (Get-FileHash -LiteralPath (Join-Path $payload 'docker-compose.yml') -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    [IO.File]::WriteAllText((Join-Path $payload 'manifest.json'), ($manifest | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    & $IsccPath "/DAppVersion=$Version" "/DStageDirectory=$program" "/DOutputDirectory=$output" (Join-Path $repo 'installer/windows/TillumiPOS.iss')
    if ($LASTEXITCODE -ne 0) { throw "Installer compilation failed ($LASTEXITCODE)" }
    $setup = Join-Path $output "TillumiPOS-Setup-$Version.exe"
    if (-not (Test-Path -LiteralPath $setup -PathType Leaf)) { throw 'Compiler did not produce the expected setup EXE' }
    Write-Output $setup
}

if ($MyInvocation.InvocationName -ne '.') { Build-WindowsInstaller }
