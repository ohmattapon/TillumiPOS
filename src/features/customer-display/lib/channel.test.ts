import { afterEach, describe, expect, test } from 'bun:test'
import { createMemoryBus, isChannelSupported, openBroadcastChannel } from './channel'
import { CHANNEL_NAME, type DisplayMessage } from './display-state'

const hello: DisplayMessage = { type: 'hello' }
const settle = () => Bun.sleep(20)

describe('openBroadcastChannel', () => {
  const opened: { close(): void }[] = []
  afterEach(() => opened.splice(0).forEach((channel) => channel.close()))

  test('is supported where the browser has BroadcastChannel', () => {
    expect(isChannelSupported()).toBe(true)
  })

  test('what another window posts reaches the listener until it unsubscribes', async () => {
    const mine = openBroadcastChannel()
    const other = new BroadcastChannel(CHANNEL_NAME)
    opened.push(mine, other)
    const heard: unknown[] = []
    const stop = mine.subscribe((message) => heard.push(message))

    other.postMessage({ type: 'hello' })
    await settle()
    stop()
    other.postMessage({ type: 'hello' })
    await settle()

    expect(heard).toEqual([{ type: 'hello' }])
  })

  test('what it posts reaches another window', async () => {
    const mine = openBroadcastChannel()
    const other = new BroadcastChannel(CHANNEL_NAME)
    opened.push(mine, other)
    const heard: unknown[] = []
    other.onmessage = (event) => heard.push(event.data)

    mine.post(hello)
    await settle()

    expect(heard).toEqual([hello])
  })
})

describe('createMemoryBus', () => {
  test('an endpoint that closes hears nothing more and is no longer a recipient', () => {
    const bus = createMemoryBus()
    const sender = bus.open()
    const receiver = bus.open()
    const heard: unknown[] = []
    receiver.subscribe((message) => heard.push(message))

    receiver.close()
    sender.post(hello)

    expect(heard).toEqual([])
  })
})
