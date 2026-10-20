import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * scripts/lan-address.ps1 run by a real PowerShell (CI has pwsh; a machine without it skips these), with stand-ins
 * for the Windows commands it calls: administrator or not, the network profile, the firewall, netsh and whether the
 * system answers on the LAN address. Every call a stand-in receives is listed, so a test sees what the script
 * would have changed on a real machine. The script itself has only been run for real on Windows by hand.
 */
const root = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const script = join(root, 'scripts', 'lan-address.ps1')
const pwsh = Bun.env.PWSH ?? Bun.which('pwsh')
const suite = pwsh ? describe : describe.skip

const HARNESS = String.raw`
$ErrorActionPreference = 'Stop'
$s = $env:POS_SCENARIO | ConvertFrom-Json
. $env:POS_SCRIPT
$script:calls = New-Object System.Collections.Generic.List[string]
$script:forwarded = $false
$script:rule = [bool]$s.firewallRule

function Get-LanAddress { $s.ip }
function Get-DefaultRouteInterfaceIndex { 7 }
function Test-Administrator { [bool]$s.admin }
function Test-Interactive { [bool]$s.interactive }
function Test-LanReachable($Ip, $Port) { [bool]($s.reachable -or ($script:forwarded -and $s.reachableAfterForward)) }
function Get-NetFirewallRule { if ($script:rule) { 'rule' } }
function New-NetFirewallRule($DisplayName, $Direction, $Protocol, $LocalPort, $Action, $Profile, $RemoteAddress) {
  $script:calls.Add("New-NetFirewallRule port=$LocalPort profile=$($Profile -join ',') remote=$RemoteAddress")
}
function Set-NetFirewallRule($DisplayName, $Profile, $RemoteAddress) {
  $script:calls.Add("Set-NetFirewallRule profile=$($Profile -join ',') remote=$RemoteAddress")
}
function Get-NetConnectionProfile($InterfaceIndex) { [pscustomobject]@{ NetworkCategory = $s.category } }
function Set-NetConnectionProfile($InterfaceIndex, $NetworkCategory) { $script:calls.Add("Set-NetConnectionProfile index=$InterfaceIndex $NetworkCategory") }
function Read-Host($Prompt) { $script:calls.Add('Read-Host'); $s.answer }
function netsh {
  $line = "$args"
  if ($line -like 'interface portproxy show*') { return $s.portproxy }
  $script:calls.Add("netsh $line")
  if ($line -like 'interface portproxy add*') { $script:forwarded = $true }
}

Show-LanAddress '3000' *>&1 | ForEach-Object { "OUT: $_" }
$script:calls | ForEach-Object { "CALL: $_" }
`

let work: string
let harness: string

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'lan-access-ps-'))
  harness = join(work, 'harness.ps1')
  await writeFile(harness, HARNESS)
})

afterAll(() => rm(work, { recursive: true, force: true }))

const base = {
  ip: '192.168.1.34',
  admin: true,
  interactive: true,
  reachable: true,
  reachableAfterForward: true,
  firewallRule: false,
  category: 'Private',
  answer: '',
  portproxy: [] as string[],
}

const powershell = (args: string[], env: Record<string, string> = {}) => {
  const result = Bun.spawnSync([pwsh!, '-NoProfile', ...args], {
    env: { ...process.env, DOTNET_SYSTEM_GLOBALIZATION_INVARIANT: '1', POS_SCRIPT: script, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return { code: result.exitCode, text: result.stdout.toString() + result.stderr.toString() }
}

const run = (scenario: Partial<typeof base>) => {
  const { text } = powershell(['-File', harness], { POS_SCENARIO: JSON.stringify({ ...base, ...scenario }) })
  const lines = text.split('\n').map((line) => line.trim())
  return {
    out: lines.filter((line) => line.startsWith('OUT: ')).map((line) => line.slice(5)),
    calls: lines.filter((line) => line.startsWith('CALL: ')).map((line) => line.slice(6)),
    text,
  }
}

suite('lan-address.ps1', () => {
  test('parses, and is plain ASCII so Windows PowerShell 5.1 reads it as it was written', async () => {
    const parse = powershell([
      '-Command',
      `$e=$null;$t=$null;[System.Management.Automation.Language.Parser]::ParseFile($env:POS_SCRIPT,[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|%{$_.ToString()};exit 1}`,
    ])
    expect(parse.text.trim()).toBe('')
    expect(parse.code).toBe(0)

    const bytes = new Uint8Array(await Bun.file(script).arrayBuffer())
    expect(bytes.every((byte) => byte < 128)).toBe(true)
  // A cold pwsh process can take over five seconds on a shared CI runner.
  }, 20_000)

  test('finds the rules that forward a port to this computer, and only those', () => {
    const netsh = [
      'Listen on ipv4:             Connect to ipv4:',
      '',
      'Address         Port        Address         Port',
      '--------------- ----------  --------------- ----------',
      '192.168.1.34    3000        127.0.0.1       3000',
      '10.0.0.5        3000        127.0.0.1       3000',
      '0.0.0.0         8080        127.0.0.1       8080',
      '192.168.1.34    3000        172.17.0.2      3000',
    ]
    const { text } = powershell(['-Command', `. $env:POS_SCRIPT; Get-ForwardedAddresses @(${netsh.map((l) => `'${l}'`).join(',')}) '3000'`])

    expect(text.trim().split(/\s+/)).toEqual(['192.168.1.34', '10.0.0.5'])
  })

  test('with no network it says so and changes nothing', () => {
    const { out, calls } = run({ ip: '' })

    expect(out.join('\n')).toContain('Could not find')
    expect(calls).toEqual([])
  })

  test('when other devices already get through, only the firewall rule is made, restricted to the local subnet', () => {
    const { out, calls } = run({})

    expect(out[0]).toBe('Other devices on the same Wi-Fi (iPad, phone): http://192.168.1.34:3000')
    expect(calls).toEqual(['New-NetFirewallRule port=3000 profile=Private,Domain remote=LocalSubnet'])
    expect(out.join('\n')).not.toContain('WARNING')
  })

  test('an existing rule is narrowed to the local subnet instead of being made twice', () => {
    expect(run({ firewallRule: true }).calls).toEqual(['Set-NetFirewallRule profile=Private,Domain remote=LocalSubnet'])
  })

  test('when the system only answers on this computer, forwarding to it is set up and checked again', () => {
    const { out, calls } = run({ reachable: false })

    expect(calls).toContain('netsh interface portproxy add v4tov4 listenaddress=192.168.1.34 listenport=3000 connectaddress=127.0.0.1 connectport=3000')
    expect(out.join('\n')).toContain('Forwarding 192.168.1.34:3000 to this computer is set up')
  })

  test('a forwarding rule left from an old address is removed, so there is one rule, for the current address', () => {
    const { calls } = run({ reachable: false, portproxy: ['10.0.0.5        3000        127.0.0.1       3000'] })
    const remove = calls.indexOf('netsh interface portproxy delete v4tov4 listenaddress=10.0.0.5 listenport=3000')
    const add = calls.findIndex((call) => call.startsWith('netsh interface portproxy add'))

    expect(remove).toBeGreaterThanOrEqual(0)
    expect(remove).toBeLessThan(add)
  })

  test('forwarding that does not help is reported, not hidden', () => {
    const { out } = run({ reachable: false, reachableAfterForward: false })

    expect(out.join('\n')).toContain('still did not answer')
  })

  test('without administrator rights nothing is changed and the way to fix it is given', () => {
    const { out, calls } = run({ admin: false, reachable: false, category: 'Public', firewallRule: false })

    expect(calls.filter((call) => call !== 'Read-Host')).toEqual([])
    expect(out.join('\n')).toContain('opened as administrator')
    expect(out.join('\n')).toContain('Public')
  })

  test('a Public network is only made Private when the owner says yes', () => {
    const yes = run({ category: 'Public', answer: 'y' })
    expect(yes.calls).toContain('Set-NetConnectionProfile index=7 Private')

    for (const answer of ['', 'n', 'no']) {
      const declined = run({ category: 'Public', answer })
      expect(declined.calls.some((call) => call.startsWith('Set-NetConnectionProfile'))).toBe(false)
      expect(declined.out.join('\n')).toContain('marked Public')
    }
  })

  test('with nobody to ask (no keyboard) a Public network is left alone and the owner is told how', () => {
    const { calls, out } = run({ category: 'Public', interactive: false })

    expect(calls).not.toContain('Read-Host')
    expect(calls.some((call) => call.startsWith('Set-NetConnectionProfile'))).toBe(false)
    expect(out.join('\n')).toContain('Network profile type')
  })
})
