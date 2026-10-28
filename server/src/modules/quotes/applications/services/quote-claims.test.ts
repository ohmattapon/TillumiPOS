import 'reflect-metadata'
import { beforeEach, describe, expect, test } from 'bun:test'
import { makePriceQuote } from '../../../../__tests__/factories'
import { mockClock, mockOrderQuoteSource, mockPriceQuoteRepository, mockPromotionUsage } from '../../../../__tests__/mocks'
import { QuoteClaims } from './quote-claims'

const now = new Date('2026-10-15T05:05:00Z')
const cart = { branchId: 1, memberId: null, orderId: null, lines: [{ productId: 1, optionIds: [], quantity: 3, packId: null }] }

let quotes: ReturnType<typeof mockPriceQuoteRepository>
let orders: ReturnType<typeof mockOrderQuoteSource>
let usage: ReturnType<typeof mockPromotionUsage>
let claims: QuoteClaims

beforeEach(() => {
  quotes = mockPriceQuoteRepository()
  orders = mockOrderQuoteSource()
  usage = mockPromotionUsage()
  claims = new QuoteClaims(quotes, orders, mockClock(now), usage)
})

describe('lockForCheckout', () => {
  test('locks the quote and returns it when the sale is the one it was made for', async () => {
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote())
    const quote = await claims.lockForCheckout(5, cart, [])
    expect(quote.id).toBe(5)
    expect(quotes.findByIdForUpdate).toHaveBeenCalledWith(5)
  })

  test("an unknown quote and another branch's quote are both not found", async () => {
    quotes.findByIdForUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce(makePriceQuote({ branchId: 2 }))
    await expect(claims.lockForCheckout(5, cart, [])).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })
    await expect(claims.lockForCheckout(5, cart, [])).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })
  })

  test('applies the rules of the quote with the time now', async () => {
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote({ expiresAt: new Date('2026-10-15T05:05:00Z') }))
    await expect(claims.lockForCheckout(5, cart, [])).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' })
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote())
    await expect(claims.lockForCheckout(5, { ...cart, memberId: 3 }, [])).rejects.toMatchObject({ code: 'QUOTE_MISMATCH' })
  })

  test("an order's quote is not sold as a one-step cart, and a cart's quote is not sold to an order", async () => {
    quotes.findByIdForUpdate.mockResolvedValueOnce(makePriceQuote({ orderId: 4 }))
    await expect(claims.lockForCheckout(5, cart, [])).rejects.toMatchObject({ code: 'QUOTE_MISMATCH' })
    quotes.findByIdForUpdate.mockResolvedValueOnce(makePriceQuote())
    await expect(claims.lockForCheckout(5, { ...cart, orderId: 4 }, [])).rejects.toMatchObject({ code: 'QUOTE_MISMATCH' })
  })
})

describe('usage limits', () => {
  const limited = {
    id: 1, name: 'ลด 10%', kind: 'percent' as const, value: 1000, maxDiscountSatang: null, discountSatang: 300,
  }
  /** The quote carries the limits only through `lockForUse`, the row it locks; these values name them for the reader. */
  const quoteOf = (limits: Partial<{ maxUses: number | null; maxUsesPerMember: number | null }> = {}, quote: Partial<Parameters<typeof makePriceQuote>[0]> = {}) =>
    makePriceQuote({ promotion: { ...limited, ...limits }, discountSatang: 300, ...quote })

  test('paying an open quote whose promotion filled up is refused with PROMOTION_LIMIT_REACHED', async () => {
    quotes.findByIdForUpdate.mockResolvedValue(quoteOf({ maxUses: 1 }))
    usage.lockForUse.mockResolvedValue({ maxUses: 1, maxUsesPerMember: null })
    usage.countUses.mockResolvedValue({ total: 1, byMember: 0 })
    await expect(claims.lockForCheckout(5, cart, [])).rejects.toMatchObject({ code: 'PROMOTION_LIMIT_REACHED' })
    // The promotion was locked before it was counted, and the quote was counted in total.
    expect(usage.lockForUse).toHaveBeenCalledWith(1)
    expect(usage.countUses).toHaveBeenCalledWith(1, null)
  })

  test('a quote for an unlimited promotion is not counted', async () => {
    quotes.findByIdForUpdate.mockResolvedValue(quoteOf())
    expect((await claims.lockForCheckout(5, cart, [])).id).toBe(5)
    // The row says the promotion has no limit, so there is nothing to count.
    expect(usage.lockForUse).toHaveBeenCalledWith(1)
    expect(usage.countUses).not.toHaveBeenCalled()
  })

  test('per-member limit counts only that member', async () => {
    const member = { id: 8, code: 'M000008', name: 'ลูกค้าประจำ' }
    quotes.findByIdForUpdate.mockResolvedValue(quoteOf({ maxUsesPerMember: 3 }, { memberId: 8, member }))
    usage.lockForUse.mockResolvedValue({ maxUses: null, maxUsesPerMember: 3 })
    usage.countUses.mockResolvedValue({ total: 10, byMember: 3 })
    await expect(claims.lockForCheckout(5, { ...cart, memberId: 8 }, [])).rejects.toMatchObject({ code: 'PROMOTION_LIMIT_REACHED' })
    expect(usage.countUses).toHaveBeenCalledWith(1, 8)
    // Other members can make up the total: one member having used their share is only their share.
    usage.countUses.mockResolvedValue({ total: 10, byMember: 2 })
    expect((await claims.lockForCheckout(5, { ...cart, memberId: 8 }, [])).id).toBe(5)
  })

  test('reserved quote sells even when the promotion is now full', async () => {
    quotes.findByIdForUpdate.mockResolvedValue(quoteOf({ maxUses: 1 }, { status: 'reserved' as const, qrReference: 'QRABC' }))
    usage.lockForUse.mockResolvedValue({ maxUses: 1, maxUsesPerMember: null })
    usage.countUses.mockResolvedValue({ total: 1, byMember: 0 })
    const quote = await claims.lockForCheckout(5, cart, ['QRABC'])
    expect(quote.id).toBe(5)
    // The money the QR holds may already be at the bank, so its slot is never re-checked.
    expect(usage.lockForUse).not.toHaveBeenCalled()
    expect(usage.countUses).not.toHaveBeenCalled()
  })

  test('reserving a QR for a full promotion is refused, and the quote stays open', async () => {
    quotes.findById.mockResolvedValue(quoteOf({ maxUses: 1 }))
    quotes.findByIdForUpdate.mockResolvedValue(quoteOf({ maxUses: 1 }))
    usage.lockForUse.mockResolvedValue({ maxUses: 1, maxUsesPerMember: null })
    usage.countUses.mockResolvedValue({ total: 1, byMember: 0 })
    await expect(claims.reserveForQr(5, { branchId: 1, reference: 'QRABC', amountSatang: 3000 }))
      .rejects.toMatchObject({ code: 'PROMOTION_LIMIT_REACHED' })
    expect(quotes.save).not.toHaveBeenCalled()
  })
})

describe('reserveForQr', () => {
  const claim = { branchId: 1, reference: 'QRABC', amountSatang: 3000 }

  test('holds an open quote for the reference', async () => {
    quotes.findById.mockResolvedValue(makePriceQuote())
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote())
    await claims.reserveForQr(5, claim)
    expect(quotes.save.mock.calls[0]![0]).toMatchObject({ status: 'reserved', qrReference: 'QRABC' })
    expect(orders.lockOpenOrder).not.toHaveBeenCalled()
  })

  test('a QR for part of the total is accepted and one for more is not', async () => {
    quotes.findById.mockResolvedValue(makePriceQuote())
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote())
    await claims.reserveForQr(5, { ...claim, amountSatang: 1000 })
    await expect(claims.reserveForQr(5, { ...claim, amountSatang: 3001 })).rejects.toMatchObject({ code: 'QUOTE_AMOUNT_MISMATCH' })
    expect(quotes.save).toHaveBeenCalledTimes(1)
  })

  test('refuses a quote that is taken, expired, or of another branch', async () => {
    quotes.findById.mockResolvedValue(makePriceQuote({ branchId: 2 }))
    await expect(claims.reserveForQr(5, claim)).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })

    quotes.findById.mockResolvedValue(makePriceQuote())
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote({ status: 'reserved', qrReference: 'QROTHER' }))
    await expect(claims.reserveForQr(5, claim)).rejects.toMatchObject({ code: 'QUOTE_NOT_OPEN' })

    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote({ expiresAt: new Date('2026-10-15T05:05:00Z') }))
    await expect(claims.reserveForQr(5, claim)).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' })
  })

  test('a quote of an order locks the order first and must still match what the order holds', async () => {
    const steps: string[] = []
    const ordered = makePriceQuote({ orderId: 9, memberId: null })
    quotes.findById.mockResolvedValue(ordered)
    quotes.findByIdForUpdate.mockImplementation(async () => {
      steps.push('quote')
      return ordered
    })
    orders.lockOpenOrder.mockImplementation(async () => {
      steps.push('order')
      return { id: 9, memberId: null, items: [{ productId: 1, productName: 'น้ำดื่ม', sku: 'SKU-1', unitPriceSatang: 1000, quantity: 3, options: [], packId: null, packSize: 1 }] }
    })
    await claims.reserveForQr(5, claim)
    expect(steps).toEqual(['order', 'quote'])

    orders.lockOpenOrder.mockResolvedValue({ id: 9, memberId: null, items: [{ productId: 1, productName: 'น้ำดื่ม', sku: 'SKU-1', unitPriceSatang: 1000, quantity: 4, options: [], packId: null, packSize: 1 }] })
    await expect(claims.reserveForQr(5, claim)).rejects.toMatchObject({ code: 'QUOTE_MISMATCH' })
  })
})

describe('the QR holding an order', () => {
  test("says which QR holds the reserved quote of an order, in that order's branch only", async () => {
    quotes.findReservedByOrder.mockResolvedValueOnce(makePriceQuote({ orderId: 4, status: 'reserved', qrReference: 'QRABC' }))
    expect(await claims.findHeldByOrder(4, 1)).toBe('QRABC')
    quotes.findReservedByOrder.mockResolvedValueOnce(makePriceQuote({ orderId: 4, status: 'reserved', qrReference: 'QRABC' }))
    expect(await claims.findHeldByOrder(4, 2)).toBeNull()
    expect(await claims.findHeldByOrder(4, 1)).toBeNull()
  })
})

describe('settling a QR', () => {
  test('releasing reopens the quote the QR held', async () => {
    quotes.findByQrReferenceForUpdate.mockResolvedValue(makePriceQuote({ status: 'reserved', qrReference: 'QRABC' }))
    await claims.releaseByReference('QRABC')
    expect(quotes.save.mock.calls[0]![0]).toMatchObject({ status: 'open', qrReference: null })
  })

  test('cancelling closes it', async () => {
    quotes.findByQrReferenceForUpdate.mockResolvedValue(makePriceQuote({ status: 'reserved', qrReference: 'QRABC' }))
    await claims.cancelByReference('QRABC')
    expect(quotes.save.mock.calls[0]![0]).toMatchObject({ status: 'cancelled', qrReference: 'QRABC' })
  })

  test('a QR that held no quote changes nothing', async () => {
    await claims.releaseByReference('QRNONE')
    await claims.cancelByReference('QRNONE')
    expect(quotes.save).not.toHaveBeenCalled()
  })

  test('a quote already used is left alone', async () => {
    quotes.findByQrReferenceForUpdate.mockResolvedValue(makePriceQuote({ status: 'consumed', saleId: 3, qrReference: 'QRABC' }))
    await claims.releaseByReference('QRABC')
    await claims.cancelByReference('QRABC')
    expect(quotes.save).not.toHaveBeenCalled()
  })

  test('says which quote a QR holds, while it is held or after that QR was cancelled', async () => {
    quotes.findByQrReference.mockResolvedValueOnce(makePriceQuote({ status: 'reserved', qrReference: 'QRABC' }))
    expect(await claims.findHeldByReference('QRABC')).toBe(5)
    quotes.findByQrReference.mockResolvedValueOnce(makePriceQuote({ status: 'cancelled', qrReference: 'QRABC' }))
    expect(await claims.findHeldByReference('QRABC')).toBe(5)
    quotes.findByQrReference.mockResolvedValueOnce(makePriceQuote({ status: 'consumed', saleId: 3, qrReference: 'QRABC' }))
    expect(await claims.findHeldByReference('QRABC')).toBeNull()
    expect(await claims.findHeldByReference('QRNONE')).toBeNull()
  })

  test('consuming saves the quote with its sale', async () => {
    await claims.consume(makePriceQuote(), 8)
    expect(quotes.save.mock.calls[0]![0]).toMatchObject({ status: 'consumed', saleId: 8 })
  })
})
