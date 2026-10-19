import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * scripts/podman-compose.sh, run on a PATH that holds only stand-ins for uname, id, sudo, podman and brew (plus the
 * few real tools the script uses), so each test decides which machine this "is" and what Podman reports. Every call
 * to a stand-in is logged, so the tests check what the script would have asked a real Podman to do.
 */
const root = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const script = join(root, 'scripts', 'podman-compose.sh')
const REAL_TOOLS = ['mktemp', 'head', 'cat', 'rm']

let work: string

const realPath = async (tool: string) => {
  const found = Bun.which(tool)
  if (!found) throw new Error(`${tool} is needed by the tests`)
  return found
}

type Machine = { exists: boolean; rootful: boolean; running: boolean }

/** A fresh sandbox: the stand-ins named in `has`, and a podman that remembers its machine in files. */
async function sandbox(has: string[], machine: Machine = { exists: false, rootful: false, running: false }) {
  const dir = await mkdtemp(join(work, 'box-'))
  const bin = join(dir, 'bin')
  await mkdir(bin)
  for (const tool of REAL_TOOLS) await symlink(await realPath(tool), join(bin, tool))
  const log = join(dir, 'calls.log')
  await writeFile(log, '')
  const state = join(dir, 'machine')
  await mkdir(state)
  for (const [key, value] of Object.entries(machine)) if (value) await writeFile(join(state, key), '')

  const shim = async (name: string, body: string) => {
    await writeFile(join(bin, name), `#!/bin/bash\necho "${name} $*" >> "${log}"\n${body}\n`)
    await chmod(join(bin, name), 0o755)
  }
  const stateOf = (key: string) => `[ -e "${state}/${key}" ]`
  const set = (key: string, on: boolean) => (on ? `: > "${state}/${key}"` : `rm -f "${state}/${key}"`)

  if (has.includes('mac')) await shim('uname', 'echo Darwin')
  else await shim('uname', 'echo Linux')
  if (has.includes('user')) await shim('id', 'echo 1000')
  else await shim('id', 'echo 0')
  if (has.includes('sudo')) await shim('sudo', '"$@"')
  if (has.includes('brew')) await shim('brew', 'exit 0')
  if (has.includes('docker-compose')) await shim('docker-compose', 'exit 0')
  if (has.includes('podman'))
    await shim(
      'podman',
      `case "$1 $2" in
  "machine list") ${stateOf('exists')} && echo podman-machine-default ;;
  "machine init") ${set('exists', true)}; [ "$3" = --rootful ] && ${set('rootful', true)} ;;
  "machine inspect")
    case "$4" in
      "{{.Rootful}}") ${stateOf('rootful')} && echo true || echo false ;;
      "{{.State}}") ${stateOf('running')} && echo running || echo stopped ;;
    esac ;;
  "machine stop") ${set('running', false)} ;;
  "machine set") ${set('rootful', true)} ;;
  "machine start") ${set('running', true)} ;;
  *) echo "podman-ran:$*" ;;
esac`,
    )
  return { bin, log }
}

const run = async (box: { bin: string; log: string }, call: string, env: Record<string, string> = {}) => {
  const result = Bun.spawnSync(['/bin/bash', '-c', `. "${script}"; ${call}`], {
    env: { PATH: box.bin, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString(), calls: (await readFile(box.log, 'utf8')).trim().split('\n').filter(Boolean) }
}

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'podman-compose-'))
})

afterAll(() => rm(work, { recursive: true, force: true }))

describe('compose', () => {
  test('a Mac runs podman without sudo, even for a normal user', async () => {
    const box = await sandbox(['mac', 'user', 'podman'])
    const { out, calls } = await run(box, 'compose -f docker-compose.yml ps')

    expect(out).toContain('podman-ran:compose -f docker-compose.yml ps')
    expect(calls.some((c) => c.startsWith('sudo'))).toBe(false)
  })

  test('Linux uses sudo for a normal user and not for root', async () => {
    const user = await run(await sandbox(['user', 'sudo', 'podman']), 'compose ps')
    expect(user.calls[0]).toBe('uname -s')
    expect(user.calls.some((c) => c.startsWith('sudo podman compose ps'))).toBe(true)

    const asRoot = await run(await sandbox(['sudo', 'podman']), 'compose ps')
    expect(asRoot.calls.some((c) => c.startsWith('sudo'))).toBe(false)
    expect(asRoot.out).toContain('podman-ran:compose ps')
  })

  test('POS_COMPOSE replaces the command altogether', async () => {
    const box = await sandbox(['mac', 'podman'])
    const stand = join(box.bin, 'stand-in')
    await writeFile(stand, '#!/bin/bash\necho "stand-in:$*"\n')
    await chmod(stand, 0o755)

    expect((await run(box, 'compose up', { POS_COMPOSE: stand })).out).toBe('stand-in:up\n')
  })

  test('the hint names the command the user would type', async () => {
    expect((await run(await sandbox(['mac']), 'compose_hint')).out).toBe('podman compose\n')
    expect((await run(await sandbox(['user']), 'compose_hint')).out).toBe('sudo podman compose\n')
    expect((await run(await sandbox([]), 'compose_hint')).out).toBe('podman compose\n')
  })
})

describe('prepare_podman', () => {
  test('on a Mac with no machine it creates a rootful one and starts it', async () => {
    const box = await sandbox(['mac', 'podman'])
    const { code, calls } = await run(box, 'prepare_podman')

    expect(code).toBe(0)
    expect(calls).toContain('podman machine init --rootful')
    expect(calls).toContain('podman machine start')
    expect(calls.indexOf('podman machine init --rootful')).toBeLessThan(calls.indexOf('podman machine start'))
    expect(calls).not.toContain('podman machine set --rootful')
  })

  test('a machine that is not rootful is stopped, made rootful and started again', async () => {
    const box = await sandbox(['mac', 'podman'], { exists: true, rootful: false, running: true })
    const { code, calls } = await run(box, 'prepare_podman')
    const order = ['podman machine stop', 'podman machine set --rootful', 'podman machine start'].map((c) => calls.indexOf(c))

    expect(code).toBe(0)
    expect(order.every((i) => i >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  test('a machine that is already rootful and running is left alone', async () => {
    const box = await sandbox(['mac', 'podman'], { exists: true, rootful: true, running: true })
    const { code, calls } = await run(box, 'prepare_podman')

    expect(code).toBe(0)
    expect(calls.filter((c) => /^podman machine (init|stop|set|start)/.test(c))).toEqual([])
  })

  test('a stopped rootful machine is only started', async () => {
    const box = await sandbox(['mac', 'podman'], { exists: true, rootful: true, running: false })
    const { calls } = await run(box, 'prepare_podman')

    expect(calls.filter((c) => /^podman machine (init|stop|set|start)/.test(c))).toEqual(['podman machine start'])
  })

  test('compose runs without notices and with anonymous registry pulls', async () => {
    const box = await sandbox(['mac', 'podman'], { exists: true, rootful: true, running: true })
    const { out } = await run(
      box,
      'prepare_podman; echo "warn=$PODMAN_COMPOSE_WARNING_LOGS"; echo "config=$(cat "$DOCKER_CONFIG/config.json")"; rm -rf "$DOCKER_CONFIG"',
    )

    expect(out).toContain('warn=false')
    expect(out).toContain('config={}')
  })

  test('Linux and the test hook need no preparation', async () => {
    const linux = await sandbox(['podman'])
    expect((await run(linux, 'prepare_podman')).calls.some((c) => c.startsWith('podman'))).toBe(false)

    const mac = await sandbox(['mac', 'podman'])
    expect((await run(mac, 'prepare_podman', { POS_COMPOSE: '/bin/true' })).calls.some((c) => c.startsWith('podman'))).toBe(false)
  })
})

describe('install_podman_mac', () => {
  test('does nothing when Podman and Docker Compose are already there', async () => {
    const box = await sandbox(['mac', 'podman', 'docker-compose', 'brew'])
    const { code, calls } = await run(box, 'install_podman_mac')

    expect(code).toBe(0)
    expect(calls.some((c) => c.startsWith('brew'))).toBe(false)
  })

  test('installs both with Homebrew when one is missing', async () => {
    const box = await sandbox(['mac', 'podman', 'brew'])
    const { code, calls } = await run(box, 'install_podman_mac')

    expect(code).toBe(0)
    expect(calls).toContain('brew install podman docker-compose')
  })

  test('without Homebrew it says what to install first and fails', async () => {
    const { code, err } = await run(await sandbox(['mac']), 'install_podman_mac')

    expect(code).toBe(1)
    expect(err).toContain('https://brew.sh')
  })

  test('is a no-op off a Mac', async () => {
    const { code, calls } = await run(await sandbox(['brew']), 'install_podman_mac')

    expect(code).toBe(0)
    expect(calls.some((c) => c.startsWith('brew'))).toBe(false)
  })
})
