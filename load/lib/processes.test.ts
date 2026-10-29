import { expect, test } from 'bun:test'
import { createProcessGroup } from './processes'

test('stopAll ends every child and can be called twice', async () => {
  const group = createProcessGroup()
  const idle = ['bun', '-e', 'setInterval(()=>{},1000)']
  const a = group.spawn(idle, { stdout: 'ignore', stderr: 'ignore' })
  const b = group.spawn(idle, { stdout: 'ignore', stderr: 'ignore' })
  await Bun.sleep(300)
  expect(a.exitCode).toBeNull()
  expect(b.exitCode).toBeNull()

  await group.stopAll()
  expect(a.killed || a.exitCode !== null).toBe(true)
  await Promise.all([a.exited, b.exited])
  expect(a.exitCode !== null || a.signalCode !== null).toBe(true)
  expect(b.exitCode !== null || b.signalCode !== null).toBe(true)

  await group.stopAll()
}, 15_000)
