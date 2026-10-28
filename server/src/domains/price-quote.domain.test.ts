import { describe, expect, test } from 'bun:test'
import { MAX_AMOUNT_SATANG } from './sale.domain'
import {
  PriceQuoteEntity, QUOTE_VALID_FOR_MS,
  type NewPriceQuote, type PriceQuoteProps, type QuoteRequest,
} from './price-quote.domain'

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

const now = new Date('2026-10-15T05:00:00Z')
const option = { groupId: 1, groupName: 'ท็อปปิง', optionId: 7, name: 'ไข่มุก', priceSatang: 500, costSatang: 200 }
const input = (overrides: Partial<NewPriceQuote> = {}): NewPriceQuote => ({
  branchId: 1, memberId: null, member: null, orderId: null, couponCode: null,
  lines: [
    { productId: 1, productName: 'ชาไทย', sku: 'T1', unitPriceSatang: 4500, quantity: 2, options: [option], packId: null, packSize: 1 },
    { productId: 2, productName: 'เค้ก', sku: 'C1', unitPriceSatang: 6000, quantity: 1, options: [], packId: null, packSize: 1 },
  ],
  promotion: null, vatMode: 'inclusive', vatRateBp: 700, createdById: 3, ...overrides,
})
const stored = (overrides: Partial<PriceQuoteProps> = {}) =>
  new PriceQuoteEntity({
    ...PriceQuoteEntity.price(input(), now), id: 11, status: 'open', qrReference: null, saleId: null, createdAt: now, ...overrides,
  })
const request = (overrides: Partial<QuoteRequest> = {}): QuoteRequest => ({
  branchId: 1, memberId: null, orderId: null,
  lines: [
    { productId: 2, optionIds: [], quantity: 1, packId: null },
    { productId: 1, optionIds: [7], quantity: 2, packId: null },
  ],
  ...overrides,
})

describe('quote lines with packs', () => {
  const packLine = {
    productId: 1, productName: 'ชาไทย', sku: 'T1', unitPriceSatang: 10000, quantity: 2, options: [],
    packId: 5, packSize: 6,
  }
  const saleFor = (lines: QuoteRequest['lines']): QuoteRequest => ({ branchId: 1, memberId: null, orderId: null, lines })

  test('a pack line never matches the same product sold by the piece', () => {
    const quote = stored({ lines: [packLine] })
    expect(quote.matches(saleFor([{ productId: 1, optionIds: [], quantity: 2, packId: null }]))).toBe(false)
  })

  test('a pack line matches the same pack', () => {
    const quote = stored({ lines: [packLine] })
    expect(quote.matches(saleFor([{ productId: 1, optionIds: [], quantity: 2, packId: 5 }]))).toBe(true)
  })

  test('a stored row from before packs reads as pieces', () => {
    const row = JSON.parse(JSON.stringify({
      ...PriceQuoteEntity.price(input(), now), id: 11, status: 'open', qrReference: null, saleId: null, createdAt: now,
    }))
    delete row.lines[0].packId
    delete row.lines[0].packSize
    const quote = new PriceQuoteEntity(row)
    expect(quote.lines[0]).toMatchObject({ packId: null, packSize: 1 })
  })
})
const after = (ms: number) => new Date(now.getTime() + ms)

describe('pricing a quote', () => {
  test('a basket worth more than the system can carry is refused, before and after VAT', () => {
    const line = (unitPriceSatang: number) => ({ productId: 1, productName: 'ทอง', sku: 'G1', unitPriceSatang, quantity: 1, options: [], packId: null, packSize: 1 })

    expect(codeOf(() => PriceQuoteEntity.price(input({ lines: [line(MAX_AMOUNT_SATANG + 1)] }), now))).toBe('AMOUNT_TOO_LARGE')
    expect(codeOf(() => PriceQuoteEntity.price(input({ lines: [line(MAX_AMOUNT_SATANG)], vatMode: 'exclusive' }), now))).toBe('AMOUNT_TOO_LARGE')
  })

  test('totals come from the lines and the shared pricing rule', () => {
    const priced = PriceQuoteEntity.price(input(), now)
    expect(priced).toMatchObject({ subtotalSatang: 15000, discountSatang: 0, vatSatang: 981, totalSatang: 15000 })
    expect(priced.expiresAt).toEqual(after(QUOTE_VALID_FOR_MS))
  })

  test('a promotion lowers the total and is kept with the discount it gave', () => {
    const promotion = { id: 2, name: 'ลด 10%', kind: 'percent' as const, value: 1000, maxDiscountSatang: null, discountSatang: 1500 }
    const priced = PriceQuoteEntity.price(input({ promotion }), now)
    expect(priced).toMatchObject({ discountSatang: 1500, totalSatang: 13500, promotion })
  })

  test('VAT added on top raises the total, and none keeps the rate at zero', () => {
    expect(PriceQuoteEntity.price(input({ vatMode: 'exclusive' }), now)).toMatchObject({ vatSatang: 1050, totalSatang: 16050 })
    expect(PriceQuoteEntity.price(input({ vatMode: 'none' }), now)).toMatchObject({ vatSatang: 0, vatRateBp: 0, totalSatang: 15000 })
  })

  test('refuses an empty cart, a bad quantity, and a discount larger than the lines', () => {
    expect(codeOf(() => PriceQuoteEntity.price(input({ lines: [] }), now))).toBe('EMPTY_SALE')
    const bad = input().lines.map((line) => ({ ...line, quantity: 0 }))
    expect(codeOf(() => PriceQuoteEntity.price(input({ lines: bad }), now))).toBe('INVALID_QUANTITY')
    const promotion = { id: 2, name: 'x', kind: 'fixed' as const, value: 99999, maxDiscountSatang: null, discountSatang: 99999 }
    expect(codeOf(() => PriceQuoteEntity.price(input({ promotion }), now))).toBe('DISCOUNT_TOO_LARGE')
  })
})

describe('matching a request', () => {
  test('same branch, member and lines in any order match; repeated lines add up', () => {
    expect(stored().matches(request())).toBe(true)
    const split = request({ lines: [{ productId: 1, optionIds: [7], quantity: 1, packId: null }, { productId: 2, optionIds: [], quantity: 1, packId: null }, { productId: 1, optionIds: [7], quantity: 1, packId: null }] })
    expect(stored().matches(split)).toBe(true)
  })

  test('another branch, member, quantity, option or product does not match', () => {
    const quote = stored()
    expect(quote.matches(request({ branchId: 2 }))).toBe(false)
    expect(quote.matches(request({ memberId: 5 }))).toBe(false)
    expect(quote.matches(request({ lines: [{ productId: 2, optionIds: [], quantity: 1, packId: null }, { productId: 1, optionIds: [7], quantity: 3, packId: null }] }))).toBe(false)
    expect(quote.matches(request({ lines: [{ productId: 2, optionIds: [], quantity: 1, packId: null }, { productId: 1, optionIds: [], quantity: 2, packId: null }] }))).toBe(false)
    expect(quote.matches(request({ lines: [{ productId: 2, optionIds: [], quantity: 1, packId: null }] }))).toBe(false)
  })

  test("an order quote matches only its own order, and a cart quote only a one-step sale", () => {
    const orderQuote = stored({ orderId: 4 })
    expect(orderQuote.matches(request({ orderId: 4 }))).toBe(true)
    expect(orderQuote.matches(request({ orderId: 5 }))).toBe(false)
    expect(orderQuote.matches(request({ orderId: null }))).toBe(false)
    expect(stored().matches(request({ orderId: 4 }))).toBe(false)
  })
})

describe('whether it can be sold against', () => {
  test('an open quote is sold before it expires, for the cart it was made for, with no QR', () => {
    expect(() => stored().assertSellable(request(), after(QUOTE_VALID_FOR_MS - 1), [])).not.toThrow()
  })

  test('an open quote expires', () => {
    expect(codeOf(() => stored().assertSellable(request(), after(QUOTE_VALID_FOR_MS), []))).toBe('QUOTE_EXPIRED')
  })

  test('a QR that was not made from this quote cannot pay for it', () => {
    expect(codeOf(() => stored().assertSellable(request(), now, ['QRABC']))).toBe('QUOTE_MISMATCH')
  })

  test('a quote held by a QR is sold only with that QR, and long after it would have expired', () => {
    const held = stored({ status: 'reserved', qrReference: 'QRABC' })
    expect(() => held.assertSellable(request(), after(QUOTE_VALID_FOR_MS * 10), ['QRABC'])).not.toThrow()
    expect(codeOf(() => held.assertSellable(request(), now, []))).toBe('QUOTE_NOT_OPEN')
    expect(codeOf(() => held.assertSellable(request(), now, ['QROTHER']))).toBe('QUOTE_NOT_OPEN')
  })

  test("a cancelled quote is sold only with the paid QR that held it, however long after it was cancelled", () => {
    const cancelledHeld = stored({ status: 'cancelled', qrReference: 'QRABC' })
    expect(() => cancelledHeld.assertSellable(request(), after(QUOTE_VALID_FOR_MS * 10), ['QRABC'])).not.toThrow()
    expect(codeOf(() => cancelledHeld.assertSellable(request(), now, []))).toBe('QUOTE_NOT_OPEN')
    expect(codeOf(() => cancelledHeld.assertSellable(request(), now, ['QROTHER']))).toBe('QUOTE_NOT_OPEN')
  })

  test('a used or cancelled quote is not open', () => {
    // A consumed quote always has its sale; the entity refuses to build one without it.
    for (const status of ['consumed', 'cancelled'] as const)
      expect(codeOf(() => stored(status === 'consumed' ? { status, saleId: 3 } : { status }).assertSellable(request(), now, []))).toBe('QUOTE_NOT_OPEN')
  })

  test('a different cart does not match, and that is not a reason to lose the quote', () => {
    const held = stored({ status: 'reserved', qrReference: 'QRABC' })
    expect(codeOf(() => held.assertSellable(request({ memberId: 9 }), now, ['QRABC']))).toBe('QUOTE_MISMATCH')
    expect(held.status).toBe('reserved')
  })
})

describe('life of a quote', () => {
  test('a sale uses up a quote that is open, held by a QR, or cancelled while its paid QR still holds it', () => {
    expect(stored().consume(3)).toMatchObject({ status: 'consumed', saleId: 3 })
    expect(stored({ status: 'reserved', qrReference: 'QRABC' }).consume(3)).toMatchObject({ status: 'consumed', saleId: 3 })
    expect(stored({ status: 'cancelled', qrReference: 'QRABC' }).consume(3)).toMatchObject({ status: 'consumed', saleId: 3 })
    expect(codeOf(() => stored({ status: 'cancelled' }).consume(3))).toBe('QUOTE_NOT_OPEN')
  })

  test('reserving ties it to a QR reference and only works while it is open and fresh', () => {
    const held = stored().reserve('QRABC', now)
    expect(held).toMatchObject({ status: 'reserved', qrReference: 'QRABC' })
    expect(codeOf(() => stored().reserve('QRABC', after(QUOTE_VALID_FOR_MS)))).toBe('QUOTE_EXPIRED')
    expect(codeOf(() => held.reserve('QROTHER', now))).toBe('QUOTE_NOT_OPEN')
  })

  test('reserving again with the same reference changes nothing (a retried request)', () => {
    const held = stored().reserve('QRABC', now)
    expect(held.reserve('QRABC', after(QUOTE_VALID_FOR_MS * 2))).toBe(held)
  })

  test('releasing returns it to open and forgets the reference; it is harmless when nothing is held', () => {
    const released = stored().reserve('QRABC', now).release('QRABC')
    expect(released).toMatchObject({ status: 'open', qrReference: null })
    const open = stored()
    expect(open.release('QRABC')).toBe(open)
    const held = stored({ status: 'reserved', qrReference: 'QRABC' })
    expect(held.release('QROTHER')).toBe(held)
  })

  test('cancelReserved closes a quote whose QR money will never be billed', () => {
    expect(stored({ status: 'reserved', qrReference: 'QRABC' }).cancelReserved('QRABC')).toMatchObject({ status: 'cancelled', qrReference: 'QRABC' })
    const open = stored()
    expect(open.cancelReserved('QRABC')).toBe(open)
  })

  test('only an open quote can be cancelled by the till', () => {
    expect(stored().cancel().status).toBe('cancelled')
    expect(stored().cancel().cancel().status).toBe('cancelled')
    expect(codeOf(() => stored({ status: 'reserved', qrReference: 'QRABC' }).cancel())).toBe('QUOTE_NOT_OPEN')
    expect(codeOf(() => stored({ status: 'consumed', saleId: 1 }).cancel())).toBe('QUOTE_NOT_OPEN')
  })

  test('consuming records the sale once', () => {
    expect(stored().consume(8)).toMatchObject({ status: 'consumed', saleId: 8 })
    expect(stored({ status: 'reserved', qrReference: 'QRABC' }).consume(8)).toMatchObject({ status: 'consumed', saleId: 8 })
    expect(codeOf(() => stored({ status: 'consumed', saleId: 8 }).consume(9))).toBe('QUOTE_NOT_OPEN')
  })

  test('a QR for part of the total is fine, one for more than the total is not', () => {
    expect(() => stored().assertQrAmount(15000)).not.toThrow()
    expect(() => stored().assertQrAmount(1)).not.toThrow()
    expect(codeOf(() => stored().assertQrAmount(15001))).toBe('QUOTE_AMOUNT_MISMATCH')
  })
})
