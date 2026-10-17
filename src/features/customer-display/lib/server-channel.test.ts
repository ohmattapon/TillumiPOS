import { describe, expect, test } from 'bun:test'
import { createMemoryBus } from './channel'
import type { DisplayEnvelope } from './display-state'
import { combineChannels, createServerSender } from './server-channel'

const envelope = (seq: number): DisplayEnvelope => ({
  v: 1, sessionId: 'till', seq, at: seq, locale: 'th', currency: 'THB', shopName: 'ร้าน', state: { kind: 'idle' },
})
const state = (seq: number) => ({ type: 'state' as const, envelope: envelope(seq) })

describe('combineChannels', () => {
  test('posts to every channel and listens on all of them', () => {
    const near = createMemoryBus()
    const far = createMemoryBus()
    const till = combineChannels(near.open(), far.open())
    const nearScreen = near.open()
    const farScreen = far.open()
    const heardNear: unknown[] = []
    const heardFar: unknown[] = []
    nearScreen.subscribe((message) => heardNear.push(message))
    farScreen.subscribe((message) => heardFar.push(message))

    till.post(state(1))

    expect(heardNear).toHaveLength(1)
    expect(heardFar).toHaveLength(1)
  })

  test('stopping the listener stops it on every channel', () => {
    const bus = createMemoryBus()
    const other = createMemoryBus()
    const screen = combineChannels(bus.open(), other.open())
    const heard: unknown[] = []
    const stop = screen.subscribe((message) => heard.push(message))
    stop()
    bus.open().post({ type: 'hello' })
    other.open().post({ type: 'hello' })
    expect(heard).toEqual([])
  })
})

describe('createServerSender', () => {
  const deferred = () => {
    let resolve!: () => void
    const promise = new Promise<void>((done) => { resolve = done })
    return { promise, resolve }
  }

  test('sends a state and ignores what screens ask the till', () => {
    const sent: number[] = []
    const sender = createServerSender({ send: async (e) => { sent.push(e.seq) } })
    sender.post({ type: 'hello' })
    sender.post(state(1))
    expect(sent).toEqual([1])
  })

  test('keeps one request in flight and sends only the newest of those that waited', async () => {
    const sent: number[] = []
    const gates = [deferred(), deferred(), deferred()]
    let call = 0
    const sender = createServerSender({
      send: async (e) => {
        sent.push(e.seq)
        await gates[call++]!.promise
      },
    })

    sender.post(state(1))
    sender.post(state(2))
    sender.post(state(3))
    expect(sent).toEqual([1])

    gates[0]!.resolve()
    await Bun.sleep(1)
    expect(sent).toEqual([1, 3])
  })

  test('sends nothing while it is not enabled, and tells a failure without stopping', async () => {
    let enabled = false
    const errors: unknown[] = []
    const sent: number[] = []
    const sender = createServerSender({
      send: async (e) => {
        sent.push(e.seq)
        if (e.seq === 2) throw new Error('offline')
      },
      isEnabled: () => enabled,
      onError: (error) => errors.push(error),
    })

    sender.post(state(1))
    expect(sent).toEqual([])
    enabled = true
    sender.post(state(2))
    await Bun.sleep(1)
    sender.post(state(3))
    await Bun.sleep(1)

    expect(sent).toEqual([2, 3])
    expect(errors).toHaveLength(1)
  })
})
