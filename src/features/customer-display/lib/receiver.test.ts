import { describe, expect, test } from 'bun:test'
import { STALE_AFTER_MS } from './display-state'
import { DisplayReceiver } from './receiver'

const selling = {
  kind: 'selling',
  lines: [{ name: 'กาแฟ', options: [], quantity: 1, lineTotalSatang: 3500 }],
  subtotalSatang: 3500,
  discountSatang: 0,
  vatSatang: 229,
  vatMode: 'inclusive',
  totalSatang: 3500,
}
const state = (overrides: Record<string, unknown> = {}) => ({
  type: 'state',
  envelope: { v: 1, sessionId: 'till-1', seq: 1, at: 1_000, locale: 'th', currency: 'THB', shopName: 'ร้านตัวอย่าง', state: selling, ...overrides },
})

function setup() {
  const clock = { now: 10_000 }
  const receiver = new DisplayReceiver(() => clock.now)
  return { clock, receiver }
}

describe('DisplayReceiver', () => {
  test('has nothing to show until the till speaks', () => {
    expect(setup().receiver.view()).toBeNull()
  })

  test('shows what the till sent, and says the view changed', () => {
    const { receiver } = setup()
    expect(receiver.receive(state())).toBe(true)
    expect(receiver.view()?.state).toEqual(selling as never)
    expect(receiver.view()?.shopName).toBe('ร้านตัวอย่าง')
  })

  test('ignores an older or repeated message of the same session', () => {
    const { receiver } = setup()
    receiver.receive(state({ seq: 5 }))
    expect(receiver.receive(state({ seq: 5 }))).toBe(false)
    expect(receiver.receive(state({ seq: 4, state: { kind: 'idle' } }))).toBe(false)
    expect(receiver.view()?.state.kind).toBe('selling')
  })

  test('ignores hello and anything it cannot read', () => {
    const { receiver } = setup()
    expect(receiver.receive({ type: 'hello' })).toBe(false)
    expect(receiver.receive(null)).toBe(false)
    expect(receiver.receive({ type: 'state', envelope: { v: 3 } })).toBe(false)
    expect(receiver.view()).toBeNull()
  })

  test('goes idle when the till has been quiet too long, keeping the shop name', () => {
    const { receiver, clock } = setup()
    receiver.receive(state())
    clock.now += STALE_AFTER_MS
    expect(receiver.view()?.state.kind).toBe('selling')

    clock.now += 1
    const idle = receiver.view()!
    expect(idle.state).toEqual({ kind: 'idle' })
    expect(idle.shopName).toBe('ร้านตัวอย่าง')
    // The same object each time, so a once-a-second refresh does not re-render the page.
    expect(receiver.view()).toBe(idle)
  })

  test('a new message after the silence brings the screen back', () => {
    const { receiver, clock } = setup()
    receiver.receive(state())
    clock.now += STALE_AFTER_MS + 1_000
    expect(receiver.view()?.state.kind).toBe('idle')

    receiver.receive(state({ seq: 2 }))
    expect(receiver.view()?.state.kind).toBe('selling')
  })

  test('a till that reloaded replaces the old one, and the old one cannot come back', () => {
    const { receiver } = setup()
    receiver.receive(state({ sessionId: 'old', seq: 40, at: 1_000 }))
    receiver.receive(state({ sessionId: 'new', seq: 1, at: 2_000, state: { kind: 'idle' } }))
    expect(receiver.view()?.state.kind).toBe('idle')

    expect(receiver.receive(state({ sessionId: 'old', seq: 41, at: 1_500 }))).toBe(false)
    expect(receiver.view()?.state.kind).toBe('idle')
  })
})
