$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../../scripts/build-windows-installer.ps1"
function Assert-True($Condition, $Message) { if (-not $Condition) { throw $Message } }
function Assert-Rejected([scriptblock]$Action, $Message) {
    $rejected = $false
    try { & $Action } catch { $rejected = $true }
    Assert-True $rejected $Message
}
$canonical = [IO.File]::ReadAllText("$PSScriptRoot/../../docker-compose.yml")
$converted = ConvertTo-PackagedCompose $canonical 'localhost/tillumipos:1.2.3'
Assert-True ($converted -match '    image: localhost/tillumipos:1.2.3') 'Missing pinned app image'
Assert-True ($converted -notmatch '(?m)^    build:') 'Packaged compose must never build'
Assert-True ($converted.Replace('    image: localhost/tillumipos:1.2.3', '    build: .') -ceq $canonical) 'Conversion changed other compose settings'
Assert-Rejected { ConvertTo-PackagedCompose $canonical.Replace('    build: .', '    build: ./other') 'localhost/tillumipos:1.2.3' } 'Changed canonical build must require review'
foreach ($bad in @('latest', '1.2', '1.2.3-beta', '../1.2.3', '01.2.3', '65536.0.0')) {
    Assert-Rejected { Assert-PackageVersion $bad } "Accepted invalid version: $bad"
}
Assert-PackageVersion '1.2.3'
Assert-Rejected { Assert-ImageArchive "$PSScriptRoot/missing.tar" 'localhost/tillumipos:1.2.3' } 'Accepted missing archive'
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('tillumipos-packaging-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    [IO.File]::WriteAllText((Join-Path $testRoot 'manifest.json'), '[{"Config":"config.json","RepoTags":["localhost/tillumipos:9.8.7"],"Layers":[]}]')
    [IO.File]::WriteAllText((Join-Path $testRoot 'config.json'), '{"architecture":"amd64","os":"linux"}')
    $archive = Join-Path $testRoot 'app.tar'
    & tar -cf $archive -C $testRoot manifest.json config.json
    if ($LASTEXITCODE -ne 0) { throw 'Fixture archive creation failed' }
    Assert-ImageArchive $archive 'localhost/tillumipos:9.8.7'
    Assert-Rejected { Assert-ImageArchive $archive 'localhost/tillumipos:1.2.3' } 'Accepted wrong archive tag'
    # Substitute only the compiler; exercise the real staging and hashing with an explicit allowlist.
    $fakeCompiler = Join-Path $testRoot 'compiler.ps1'
    @'
$definitions = @{}
foreach ($argument in $args) {
    if ($argument -match '^/D([a-zA-Z]+)=(.*)$') { $definitions[$Matches[1]] = $Matches[2] }
}
[IO.File]::WriteAllBytes((Join-Path $definitions.OutputDirectory ("TillumiPOS-Setup-" + $definitions.AppVersion + '.exe')), [byte[]]@(0))
$global:LASTEXITCODE = 0
'@ | Set-Content -LiteralPath $fakeCompiler -Encoding ASCII
    $Version = '9.8.7'
    $ImageArchive = $archive
    $OutputDirectory = Join-Path $testRoot 'output'
    $IsccPath = $fakeCompiler
    Build-WindowsInstaller | Out-Null
    $staged = Get-ChildItem -LiteralPath $OutputDirectory -Directory | Select-Object -First 1
    $programRoot = Join-Path $staged.FullName 'program'
    $actual = @(Get-ChildItem -LiteralPath $programRoot -File -Recurse | ForEach-Object { $_.FullName.Substring($programRoot.Length + 1).Replace('\', '/') } | Sort-Object)
    $expected = @('LICENSE', 'enable-wsl.ps1', 'launcher.ps1', 'network.ps1', 'runtime.ps1', 'worker.ps1', 'payload/app-image.tar', 'payload/Caddyfile', 'payload/docker-compose.yml', 'payload/manifest.json', 'payload/scripts/podman-windows.ps1', 'payload/scripts/lan-address.ps1') | Sort-Object
    Assert-True (($actual -join "`n") -ceq ($expected -join "`n")) 'Staging included unexpected files or omitted required payload'
    $packagedManifest = Get-Content (Join-Path $programRoot 'payload/manifest.json') -Raw | ConvertFrom-Json
    Assert-True ($packagedManifest.sha256 -ieq (Get-FileHash $archive -Algorithm SHA256).Hash) 'Packaged archive hash does not match'
    Assert-True ($packagedManifest.composeSha256 -ieq (Get-FileHash (Join-Path $programRoot 'payload/docker-compose.yml') -Algorithm SHA256).Hash) 'Packaged compose hash does not match'
    [IO.File]::WriteAllText((Join-Path $testRoot 'config.json'), '{"architecture":"arm64","os":"linux"}')
    & tar -cf $archive -C $testRoot manifest.json config.json
    Assert-Rejected { Assert-ImageArchive $archive 'localhost/tillumipos:9.8.7' } 'Accepted wrong archive architecture'
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    if ($resolved.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf).StartsWith('tillumipos-packaging-test-')) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
Write-Output 'Packaging tests passed'
