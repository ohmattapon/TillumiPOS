import { expect, test } from 'bun:test'
import { createProcessGroup } from './processes'

const idle = ['bun', '-e', 'setInterval(()=>{},1000)']
const quiet = { stdout: 'ignore', stderr: 'ignore' } as const
const ended = (child: { exitCode: number | null; signalCode: unknown }) => child.exitCode !== null || child.signalCode !== null

test('stopAll ends every child and can be called twice', async () => {
  const group = createProcessGroup()
  const a = group.spawn(idle, quiet)
  const b = group.spawn(idle, quiet)
  await Bun.sleep(300)
  expect(ended(a)).toBe(false)
  expect(ended(b)).toBe(false)

  await group.stopAll()
  expect(ended(a)).toBe(true)
  expect(ended(b)).toBe(true)

  await group.stopAll()
}, 15_000)

test('a second stopAll made while the first is running waits until the children are gone', async () => {
  const group = createProcessGroup()
  const a = group.spawn(idle, quiet)
  await Bun.sleep(300)
  const first = group.stopAll()
  await group.stopAll()
  expect(ended(a)).toBe(true)
  await first
}, 15_000)

test('a child that ignores SIGTERM is killed once the grace period is over', async () => {
  const group = createProcessGroup({ graceMs: 200 })
  const stubborn = group.spawn(['bun', '-e', "process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"], { stdout: 'pipe', stderr: 'ignore' })
  const reader = (stubborn.stdout as ReadableStream<Uint8Array>).getReader()
  await reader.read() // the handler is installed once it says so
  const started = Date.now()
  await group.stopAll()
  expect(ended(stubborn)).toBe(true)
  expect(Date.now() - started).toBeLessThan(5000)
}, 15_000)
