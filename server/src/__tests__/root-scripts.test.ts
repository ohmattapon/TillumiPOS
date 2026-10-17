import { expect, test } from 'bun:test'

// Bun applies the tsconfig of the working directory. Tests run from server/, but `bun run dev` and the seed scripts
// run the server from the repo root, where tsyringe still needs decorator metadata to build the use cases.
const root = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

test('server code run from the repo root gets decorator metadata, as bun run dev and the seeds do', () => {
  const run = Bun.spawnSync(['bun', 'test', '--preload', './server/test/setup.ts', './server/src/libs/di.test.ts'], {
    cwd: root,
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  expect(run.stderr.toString()).not.toContain('TypeInfo not known')
  expect(run.exitCode).toBe(0)
}, 30_000)
