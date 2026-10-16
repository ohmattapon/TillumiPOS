import { beforeEach, describe, expect, test } from 'bun:test'
import { baseUrl, client, ok, resetDatabase, signIn, type Session } from '../../../test/harness'

let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  cashier = await signIn('cashier')
})

const display = () => client()['customer-display']

const envelope = (seq: number, total = 9500) => ({
  v: 1 as const, sessionId: 'till-1', seq, at: seq, locale: 'th' as const, currency: 'THB', shopName: 'ร้านกาแฟ',
  state: {
    kind: 'selling' as const,
    lines: [{ name: 'กาแฟเย็น', options: ['หวานน้อย'], quantity: 2, lineTotalSatang: total }],
    subtotalSatang: total, discountSatang: 0, vatSatang: 621, vatMode: 'inclusive' as const, totalSatang: total,
  },
})

/** Reads a screen's stream until `done` says enough, then closes it. */
async function listen(token: string, done: (events: { event: string; data: unknown }[]) => boolean) {
  const controller = new AbortController()
  const response = await fetch(`${baseUrl}/customer-display/stream?token=${token}`, { signal: controller.signal })
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  const events: { event: string; data: unknown }[] = []
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const deadline = Date.now() + 8000
  while (Date.now() < deadline && !done(events)) {
    const { value, done: ended } = await reader.read()
    if (ended) break
    buffer += decoder.decode(value, { stream: true })
    for (const block of buffer.split('\n\n').slice(0, -1)) {
      const event = /^event: (.*)$/m.exec(block)?.[1]
      const data = /^data: (.*)$/m.exec(block)?.[1]
      if (event) events.push({ event, data: data ? JSON.parse(data) : null })
    }
    buffer = buffer.slice(buffer.lastIndexOf('\n\n') + 2)
  }
  controller.abort()
  return events
}

describe('the customer display over the server', () => {
  test('a screen shows a code, the cashier pairs it, and the sale reaches the screen', async () => {
    const screen = ok(await display().sessions.post())
    expect(screen.code).toMatch(/^\d{6}$/)

    const paired = ok(await cashier.api['customer-display'].pair.post({ code: screen.code }))
    expect(paired).toEqual({ displays: 1 })
    expect(ok(await cashier.api['customer-display'].pair.get({ query: {} }))).toEqual({ displays: 1 })

    ok(await cashier.api['customer-display'].state.put({ envelope: envelope(1) }))

    const events = await listen(screen.token, (heard) => heard.some((e) => e.event === 'state'))
    expect(events.map((e) => e.event)).toEqual(['paired', 'state'])
    expect(events[1]!.data).toMatchObject({ seq: 1, state: { kind: 'selling', totalSatang: 9500 } })
  })

  test('a screen that is not paired yet is told its code', async () => {
    const screen = ok(await display().sessions.post())
    const events = await listen(screen.token, (heard) => heard.length >= 1)
    expect(events[0]).toMatchObject({ event: 'waiting', data: { code: screen.code } })
  })

  test('a wrong code is not found, and the code works once', async () => {
    const screen = ok(await display().sessions.post())
    const wrong = await cashier.api['customer-display'].pair.post({ code: screen.code === '000000' ? '111111' : '000000' })
    expect(wrong.status).toBe(404)
    expect(wrong.error?.value).toMatchObject({ code: 'DISPLAY_CODE_NOT_FOUND' })

    ok(await cashier.api['customer-display'].pair.post({ code: screen.code }))
    const again = await cashier.api['customer-display'].pair.post({ code: screen.code })
    expect(again.status).toBe(404)
  })

  test('only a signed-in person can pair, send a state or let screens go', async () => {
    const anonymous = client()['customer-display']
    expect((await anonymous.pair.post({ code: '123456' })).status).toBe(401)
    expect((await anonymous.state.put({ envelope: envelope(1) })).status).toBe(401)
    expect((await anonymous.pair.delete({ query: {} })).status).toBe(401)
  })

  test('letting the screens go ends their streams, and a bad state is refused', async () => {
    const screen = ok(await display().sessions.post())
    ok(await cashier.api['customer-display'].pair.post({ code: screen.code }))

    const bad = await cashier.api['customer-display'].state.put({ envelope: { ...envelope(1), seq: -1 } })
    expect(bad.status).toBe(422)

    const reading = listen(screen.token, (heard) => heard.some((e) => e.event === 'unpaired'))
    await Bun.sleep(100)
    expect(ok(await cashier.api['customer-display'].pair.delete({ query: {} }))).toEqual({ displays: 1 })
    expect((await reading).map((e) => e.event)).toContain('unpaired')
  })

  test('a token that does not exist has no stream', async () => {
    const response = await fetch(`${baseUrl}/customer-display/stream?token=${'x'.repeat(40)}`)
    expect(response.status).toBe(404)
  })
})
