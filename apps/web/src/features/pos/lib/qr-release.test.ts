import { describe, expect, test } from 'bun:test'
import { runAfterRelease } from './qr-release'

describe('runAfterRelease', () => {
  test('runs the next step once the release has succeeded', async () => {
    const order: string[] = []
    const ok = await runAfterRelease(async () => { order.push('release') }, () => { order.push('next') })
    expect(ok).toBe(true)
    expect(order).toEqual(['release', 'next'])
  })

  test('waits for a release that takes a while before the next step runs', async () => {
    let finish!: () => void
    const release = new Promise<void>((resolve) => { finish = resolve })
    let ran = false
    const pending = runAfterRelease(() => release, () => { ran = true })
    await Promise.resolve()
    expect(ran).toBe(false)
    finish()
    await pending
    expect(ran).toBe(true)
  })

  test('does not run the next step when the release fails', async () => {
    let ran = false
    const ok = await runAfterRelease(async () => { throw new Error('bank refused') }, () => { ran = true })
    expect(ok).toBe(false)
    expect(ran).toBe(false)
  })
})
