import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import { MAX_AMOUNT_SATANG } from './sale.domain'

// NOTE: reference vectors below were cross-checked one-off against the
// `promptpay-qr@0.5.0` npm package (run in a temp dir, NOT added as a
// dependency):
//   q('0812345678', { amount: 100 })
//     -> 00020101021229370016A000000677010111011300668123456785802TH53037645406100.006304BB8A
//   q('1234567890123', { amount: 100 })
//     -> 00020101021229370016A000000677010111021312345678901235802TH53037645406100.006304BB6C
//   q('0812345678', {}) (no amount)
//     -> 00020101021129370016A000000677010111011300668123456785802TH530376463045D82
//
// Field `01` choice: the reference library emits `11` when no amount is given
// (static, reusable QR) and `12` when an amount is embedded (dynamic, one bill).
// This function ALWAYS embeds the bill amount, so it ALWAYS emits `12`.
// Field order follows the reference library: 00, 01, 29, 58, 53, 54, 63
// (note `58` before `53`).

const PHONE_VECTOR = '00020101021229370016A000000677010111011300668123456785802TH53037645406100.006304BB8A'
const ID_VECTOR = '00020101021229370016A000000677010111021312345678901235802TH53037645406100.006304BB6C'

/** CRC16-CCITT (0xFFFF init, poly 0x1021): independent re-implementation for the test. */
const crc16 = (input: string): string => {
  let crc = 0xffff
  for (const char of input) {
    crc ^= char.charCodeAt(0) << 8
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Walks tag+length+value triplets; throws when any length disagrees with the bytes. */
const parseTlv = (payload: string): { tag: string; value: string }[] => {
  const fields: { tag: string; value: string }[] = []
  let at = 0
  while (at < payload.length) {
    const tag = payload.slice(at, at + 2)
    const length = Number(payload.slice(at + 2, at + 4))
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(length)) throw new Error(`bad TLV header at offset ${at}`)
    const value = payload.slice(at + 4, at + 4 + length)
    if (value.length !== length) throw new Error(`TLV length mismatch at tag ${tag}`)
    fields.push({ tag, value })
    at += 4 + length
  }
  return fields
}

describe('buildPromptPayPayload', () => {
  test('phone 0812345678 with 100.00 THB matches the reference vector', async () => {
    const { buildPromptPayPayload } = await import('./promptpay-qr.domain')
    expect(buildPromptPayPayload('0812345678', 10_000)).toBe(PHONE_VECTOR)
  })

  test('13-digit citizen ID uses sub-tag 02 and matches the reference vector', async () => {
    const { buildPromptPayPayload } = await import('./promptpay-qr.domain')
    const payload = buildPromptPayPayload('1234567890123', 10_000)
    expect(payload).toBe(ID_VECTOR)
    expect(payload).toContain('02131234567890123')
    expect(payload).not.toContain('0066')
  })

  test('starts with payload-format 000201 and carries the PromptPay AID, THB and TH markers', async () => {
    const { buildPromptPayPayload } = await import('./promptpay-qr.domain')
    const payload = buildPromptPayPayload('0812345678', 10_000)
    expect(payload.startsWith('000201')).toBe(true)
    expect(payload).toContain('A000000677010111')
    expect(payload).toContain('5303764')
    expect(payload).toContain('5802TH')
  })

  test.each([
    ['letters', '08ab345678'],
    ['too short', '081234567'],
    ['11 digits', '08123456789'],
    ['12 digits', '081234567890'],
    ['14 digits', '12345678901234'],
    ['empty', ''],
    ['spaces', '081 234 5678'],
    ['dashes', '081-234-5678'],
    ['10 digits not starting with 0', '1812345678'],
  ])('rejects malformed target (%s)', async (_label, target) => {
    const { buildPromptPayPayload } = await import('./promptpay-qr.domain')
    let caught: unknown
    try {
      buildPromptPayPayload(target, 10_000)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(DomainError)
    expect((caught as DomainError).code).toBe('INVALID_SHOP_SETTINGS')
  })

  test.each([
    ['zero', 0],
    ['negative', -100],
    ['non-integer', 100.5],
    ['NaN', Number.NaN],
    [`over MAX_AMOUNT_SATANG (${MAX_AMOUNT_SATANG})`, MAX_AMOUNT_SATANG + 1],
  ])('rejects amount %s', async (_label, amountSatang) => {
    const { buildPromptPayPayload } = await import('./promptpay-qr.domain')
    let caught: unknown
    try {
      buildPromptPayPayload('0812345678', amountSatang)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(DomainError)
  })

  test('over-max amount reports AMOUNT_TOO_LARGE', async () => {
    const { buildPromptPayPayload } = await import('./promptpay-qr.domain')
    let caught: unknown
    try {
      buildPromptPayPayload('0812345678', MAX_AMOUNT_SATANG + 1)
    } catch (error) {
      caught = error
    }
    expect((caught as DomainError).code).toBe('AMOUNT_TOO_LARGE')
  })

  test('every tag/length agrees with its bytes and CRC matches an independent recomputation', async () => {
    const { buildPromptPayPayload } = await import('./promptpay-qr.domain')
    for (const [target, amountSatang] of [
      ['0812345678', 10_000],
      ['0812345678', 1],
      ['1234567890123', 99_999_999],
    ] as const) {
      const payload = buildPromptPayPayload(target, amountSatang)
      const fields = parseTlv(payload)
      expect(fields.map((field) => field.tag)).toEqual(['00', '01', '29', '58', '53', '54', '63'])
      expect(fields.at(-1)!.value).toBe(crc16(payload.slice(0, -4)))
      expect(fields.find((field) => field.tag === '54')!.value).toBe(`${(amountSatang / 100).toFixed(2)}`)
    }
  })
})
