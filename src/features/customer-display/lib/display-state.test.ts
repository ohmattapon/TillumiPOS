import { describe, expect, test } from 'bun:test'
import { isStale, parseEnvelope, parseMessage, pickNewer, STALE_AFTER_MS, type DisplayEnvelope } from './display-state'

const line = { name: 'กาแฟเย็น', options: ['หวานน้อย'], quantity: 2, lineTotalSatang: 7000 }
const selling = {
  kind: 'selling',
  lines: [line],
  subtotalSatang: 7000,
  discountSatang: 0,
  vatSatang: 458,
  vatMode: 'inclusive',
  totalSatang: 7000,
}
const envelope = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  sessionId: 'till-1',
  seq: 1,
  at: 1_000,
  locale: 'th',
  currency: 'THB',
  shopName: 'ร้านตัวอย่าง',
  state: selling,
  ...overrides,
})
const valid = (overrides: Record<string, unknown> = {}) => parseEnvelope(envelope(overrides)) as DisplayEnvelope

describe('parseEnvelope', () => {
  test('accepts a selling state exactly as sent', () => {
    expect(parseEnvelope(envelope())).toEqual(envelope() as unknown as DisplayEnvelope)
  })

  test('accepts idle, paying (with and without a QR) and paid', () => {
    expect(parseEnvelope(envelope({ state: { kind: 'idle' } }))?.state).toEqual({ kind: 'idle' })
    const qr = { image: 'iVBORw0KGgo=', expiresAt: '2026-10-14T10:35:00.000Z' }
    expect(parseEnvelope(envelope({ state: { kind: 'paying', lines: [line], totalSatang: 7000, qr } }))?.state)
      .toEqual({ kind: 'paying', lines: [line], totalSatang: 7000, qr })
    expect(parseEnvelope(envelope({ state: { kind: 'paying', lines: [line], totalSatang: 7000, qr: null } }))?.state)
      .toEqual({ kind: 'paying', lines: [line], totalSatang: 7000, qr: null })
    expect(parseEnvelope(envelope({ state: { kind: 'paid', totalSatang: 7000, changeSatang: 300 } }))?.state)
      .toEqual({ kind: 'paid', totalSatang: 7000, changeSatang: 300 })
  })

  test('drops fields it does not know, so internal data a sender adds never reaches the page', () => {
    const parsed = parseEnvelope(envelope({
      cashierName: 'สมชาย',
      state: { ...selling, costSatang: 3000, lines: [{ ...line, stockQty: 4, productId: 9 }] },
    }))!
    expect('cashierName' in parsed).toBe(false)
    expect('costSatang' in parsed.state).toBe(false)
    const shown = parsed.state as Extract<DisplayEnvelope['state'], { kind: 'selling' }>
    expect(Object.keys(shown.lines[0]!).sort()).toEqual(['lineTotalSatang', 'name', 'options', 'quantity'])
  })

  test.each([
    ['another version', { v: 2 }],
    ['no session', { sessionId: '' }],
    ['an over-long session', { sessionId: 'x'.repeat(65) }],
    ['a negative sequence', { seq: -1 }],
    ['an unknown locale', { locale: 'fr' }],
    ['a lower-case currency', { currency: 'thb' }],
    ['an over-long shop name', { shopName: 'x'.repeat(201) }],
    ['an unknown state', { state: { kind: 'refund' } }],
    ['a negative amount', { state: { ...selling, totalSatang: -1 } }],
    ['a fractional amount', { state: { ...selling, totalSatang: 10.5 } }],
    ['an unknown VAT mode', { state: { ...selling, vatMode: 'maybe' } }],
    ['lines that are not a list', { state: { ...selling, lines: 'กาแฟ' } }],
    ['a line with no quantity', { state: { ...selling, lines: [{ ...line, quantity: 0 }] } }],
  ])('rejects %s', (_name, overrides) => {
    expect(parseEnvelope(envelope(overrides))).toBeNull()
  })

  test('rejects a message that would take the screen down: too many lines, too many options', () => {
    expect(parseEnvelope(envelope({ state: { ...selling, lines: Array.from({ length: 301 }, () => line) } }))).toBeNull()
    expect(parseEnvelope(envelope({ state: { ...selling, lines: [{ ...line, options: Array.from({ length: 21 }, () => 'x') }] } }))).toBeNull()
  })

  test('rejects a QR image that is not plain base64, so it cannot break out of the image source', () => {
    const paying = (image: unknown, expiresAt: unknown = '2026-10-14T10:35:00.000Z') =>
      envelope({ state: { kind: 'paying', lines: [line], totalSatang: 7000, qr: { image, expiresAt } } })
    expect(parseEnvelope(paying('abc"><script>alert(1)</script>'))).toBeNull()
    expect(parseEnvelope(paying('javascript:alert(1)'))).toBeNull()
    expect(parseEnvelope(paying(''))).toBeNull()
    expect(parseEnvelope(paying(42))).toBeNull()
    expect(parseEnvelope(paying('A'.repeat(200_001)))).toBeNull()
    expect(parseEnvelope(paying('iVBORw0KGgo=', 'not a date'))).toBeNull()
  })

  // Each case is a row: bun spreads an array element as arguments, so a bare [] would call the test with none.
  test.each([[null], [undefined], ['hello'], [7], [[]], [{}]])('rejects %p', (raw) => {
    expect(parseEnvelope(raw)).toBeNull()
  })
})

describe('parseMessage', () => {
  test('reads hello and state messages', () => {
    expect(parseMessage({ type: 'hello' })).toEqual({ type: 'hello' })
    expect(parseMessage({ type: 'state', envelope: envelope() })).toEqual({ type: 'state', envelope: valid() })
  })

  test('ignores anything else, including a state message with a bad envelope', () => {
    expect(parseMessage({ type: 'state', envelope: { v: 9 } })).toBeNull()
    expect(parseMessage({ type: 'launch' })).toBeNull()
    expect(parseMessage(null)).toBeNull()
    expect(parseMessage('state')).toBeNull()
  })
})

describe('isStale', () => {
  test('is quiet for exactly the allowed time, and stale after it', () => {
    expect(isStale(STALE_AFTER_MS, 0)).toBe(false)
    expect(isStale(STALE_AFTER_MS + 1, 0)).toBe(true)
  })
})

describe('pickNewer', () => {
  test('takes the first message', () => {
    expect(pickNewer(null, valid())).toEqual(valid())
  })

  test('within one session only a higher sequence wins', () => {
    const current = valid({ seq: 5 })
    expect(pickNewer(current, valid({ seq: 5 }))).toBe(current)
    expect(pickNewer(current, valid({ seq: 4 }))).toBe(current)
    const next = valid({ seq: 6 })
    expect(pickNewer(current, next)).toBe(next)
  })

  test('a till that reloaded (new session) replaces the old one when it spoke later', () => {
    const current = valid({ sessionId: 'old', seq: 99, at: 1_000 })
    const reloaded = valid({ sessionId: 'new', seq: 1, at: 2_000 })
    expect(pickNewer(current, reloaded)).toBe(reloaded)
  })

  test('a late message from the old session does not bring the old basket back', () => {
    const current = valid({ sessionId: 'new', seq: 3, at: 5_000 })
    const late = valid({ sessionId: 'old', seq: 100, at: 4_000 })
    expect(pickNewer(current, late)).toBe(current)
  })
})

describe('a static PromptPay QR, drawn by the screen from its payload', () => {
  // The text the QR holds: EMV digits and letters only. It is drawn as a picture, never put into markup.
  const payload = '00020101021229370016A000000677010111011300668123456785802TH530376454041.006304ABCD'
  const paying = (qr: unknown) => envelope({ state: { kind: 'paying', lines: [line], totalSatang: 100, qr } })

  test('is accepted as sent, with no expiry because the bank is never asked', () => {
    expect(parseEnvelope(paying({ payload }))?.state).toEqual({ kind: 'paying', lines: [line], totalSatang: 100, qr: { payload } })
  })

  test('rejects an empty payload, one that is not printable ASCII, and one that is too long', () => {
    expect(parseEnvelope(paying({ payload: '' }))).toBeNull()
    expect(parseEnvelope(paying({ payload: 'ไม่ใช่ QR' }))).toBeNull()
    expect(parseEnvelope(paying({ payload: `${payload}\n${payload}` }))).toBeNull()
    expect(parseEnvelope(paying({ payload: 'A'.repeat(513) }))).toBeNull()
    expect(parseEnvelope(paying({ payload: 42 }))).toBeNull()
  })

  test('rejects a QR that is both a picture and a payload, so the screen never has to choose', () => {
    expect(parseEnvelope(paying({ payload, image: 'iVBORw0KGgo=', expiresAt: '2026-10-14T10:35:00.000Z' }))).toBeNull()
  })
})
