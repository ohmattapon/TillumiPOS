import { describe, expect, test } from 'bun:test'
import { createMemoryBus } from './channel'
import { parseMessage, type DisplayEnvelope, type DisplayView } from './display-state'
import { DisplayPublisher, type Scheduler } from './publisher'

/** A heartbeat the test fires by hand. */
function manualScheduler() {
  const tasks = new Set<() => void>()
  const schedule: Scheduler = (run) => {
    tasks.add(run)
    return () => void tasks.delete(run)
  }
  return { schedule, tick: () => [...tasks].forEach((run) => run()), count: () => tasks.size }
}

const selling: DisplayView['state'] = {
  kind: 'selling',
  lines: [{ name: 'กาแฟ', options: [], quantity: 1, lineTotalSatang: 3500 }],
  subtotalSatang: 3500,
  discountSatang: 0,
  vatSatang: 229,
  vatMode: 'inclusive',
  totalSatang: 3500,
}
const view = (state: DisplayView['state'] = selling): DisplayView => ({
  locale: 'th',
  currency: 'THB',
  shopName: 'ร้านตัวอย่าง',
  state,
})

function setup() {
  const bus = createMemoryBus()
  const scheduler = manualScheduler()
  const display = bus.open()
  const heard: unknown[] = []
  display.subscribe((raw) => heard.push(raw))
  const publisher = new DisplayPublisher({
    channel: bus.open(),
    sessionId: 'till-1',
    now: () => 5_000,
    schedule: scheduler.schedule,
  })
  publisher.start()
  const envelopes = (): DisplayEnvelope[] =>
    heard.flatMap((raw) => {
      const message = parseMessage(raw)
      return message?.type === 'state' ? [message.envelope] : []
    })
  return { bus, display, publisher, scheduler, heard, envelopes }
}

describe('DisplayPublisher', () => {
  test('sends the view with its session, a rising sequence and the time', () => {
    const { publisher, envelopes } = setup()
    publisher.update(view())
    publisher.update(view({ kind: 'idle' }))

    const [first, second] = envelopes()
    expect(first).toMatchObject({ v: 1, sessionId: 'till-1', seq: 1, at: 5_000, locale: 'th', currency: 'THB', shopName: 'ร้านตัวอย่าง' })
    expect(first!.state).toEqual(selling)
    expect(second).toMatchObject({ seq: 2, state: { kind: 'idle' } })
  })

  test('answers a display that says hello with the latest state', () => {
    const { publisher, display, envelopes } = setup()
    publisher.update(view())
    display.post({ type: 'hello' })

    const sent = envelopes()
    expect(sent).toHaveLength(2)
    expect(sent[1]!.state).toEqual(selling)
    expect(sent[1]!.seq).toBe(2)
  })

  test('sends the latest state again when asked, and nothing before there is one', () => {
    const { publisher, envelopes } = setup()
    publisher.resend()
    expect(envelopes()).toHaveLength(0)

    publisher.update(view())
    publisher.resend()
    const sent = envelopes()
    expect(sent).toHaveLength(2)
    expect(sent[1]!.state).toEqual(selling)
  })

  test('repeats the latest state on every heartbeat', () => {
    const { publisher, scheduler, envelopes } = setup()
    publisher.update(view())
    scheduler.tick()
    scheduler.tick()

    expect(envelopes().map((envelope) => envelope.seq)).toEqual([1, 2, 3])
  })

  test('says nothing before it has anything to say', () => {
    const { display, scheduler, heard } = setup()
    display.post({ type: 'hello' })
    scheduler.tick()

    expect(heard).toHaveLength(0)
  })

  test('leave tells the displays to go idle but keeps the shop details', () => {
    const { publisher, envelopes } = setup()
    publisher.update(view())
    publisher.leave()

    const last = envelopes().at(-1)!
    expect(last.state).toEqual({ kind: 'idle' })
    expect(last).toMatchObject({ shopName: 'ร้านตัวอย่าง', locale: 'th', currency: 'THB' })
  })

  test('stop ends the heartbeat and stops answering hello', () => {
    const { publisher, display, scheduler, envelopes } = setup()
    publisher.update(view())
    publisher.stop()
    display.post({ type: 'hello' })
    scheduler.tick()

    expect(scheduler.count()).toBe(0)
    expect(envelopes()).toHaveLength(1)
  })
})
