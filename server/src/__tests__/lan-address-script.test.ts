import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * scripts/lan-address.sh, run with stand-ins for uname, ip, route, ipconfig and curl first on PATH, so each test
 * decides what the "network" looks like. (Its Windows twin, lan-address.ps1, cannot run here.)
 */
const root = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const script = join(root, 'scripts', 'lan-address.sh')

let bin: string

const shim = async (name: string, body: string) => {
  const file = join(bin, name)
  await writeFile(file, `#!/usr/bin/env bash\n${body}\n`)
  await chmod(file, 0o755)
}

beforeAll(async () => {
  bin = await mkdtemp(join(tmpdir(), 'lan-address-'))
  // The default: a Linux machine on 192.168.1.20 whose system answers.
  await shim('uname', 'echo "${FAKE_OS:-Linux}"')
  await shim('ip', 'if [ -n "$FAKE_IP" ]; then echo "1.1.1.1 via 192.168.1.1 dev wlan0 src $FAKE_IP uid 0"; fi')
  await shim('route', 'echo "   interface: en0"')
  await shim('ipconfig', 'if [ "$1" = getifaddr ] && [ "$2" = en0 ] && [ -n "$FAKE_IP" ]; then echo "$FAKE_IP"; else exit 1; fi')
  await shim('curl', 'echo "$*" >> "$FAKE_LOG"; [ "${FAKE_CURL:-ok}" = ok ]')
})

afterAll(() => rm(bin, { recursive: true, force: true }))

const run = async (call: string, env: Record<string, string>) => {
  const log = join(bin, 'curl.log')
  await writeFile(log, '')
  const result = Bun.spawnSync(['bash', '-c', `. "${script}"; ${call}`], {
    env: { PATH: `${bin}:${process.env.PATH}`, FAKE_LOG: log, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return { out: result.stdout.toString(), err: result.stderr.toString(), curl: await Bun.file(log).text() }
}

describe('lan-address.sh', () => {
  test('Linux: the address of the card that carries the default route', async () => {
    expect((await run('lan_ip', { FAKE_IP: '192.168.1.20' })).out).toBe('192.168.1.20\n')
  })

  test('macOS: asks the interface of the default route for its address', async () => {
    expect((await run('lan_ip', { FAKE_OS: 'Darwin', FAKE_IP: '10.0.0.7' })).out).toBe('10.0.0.7\n')
  })

  test('prints the address for other devices and checks it through that same address', async () => {
    const { out, err, curl } = await run('show_lan_address 3000', { FAKE_IP: '192.168.1.20' })

    expect(out).toContain('http://192.168.1.20:3000')
    expect(err).toBe('')
    expect(curl).toContain('http://192.168.1.20:3000/api/v1/health')
  })

  test('warns when the system does not answer on the address other devices would use', async () => {
    const { out, err } = await run('show_lan_address 3000', { FAKE_IP: '192.168.1.20', FAKE_CURL: 'fail' })

    expect(out).toContain('http://192.168.1.20:3000')
    expect(err).toContain('did not answer')
  })

  test('with no network it says so and does not guess an address or ask the network', async () => {
    const { out, err, curl } = await run('show_lan_address 3000', {})

    expect(out).toContain('Could not find')
    expect(out).not.toContain('http://')
    expect(err).toBe('')
    expect(curl).toBe('')
  })
})
