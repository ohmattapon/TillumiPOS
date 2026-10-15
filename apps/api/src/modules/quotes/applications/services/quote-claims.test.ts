import 'reflect-metadata'
import { beforeEach, describe, expect, test } from 'bun:test'
import { makePriceQuote } from '../../../../__tests__/factories'
import { mockClock, mockOrderQuoteSource, mockPriceQuoteRepository } from '../../../../__tests__/mocks'
import { QuoteClaims } from './quote-claims'

const now = new Date('2026-10-15T05:05:00Z')
const cart = { branchId: 1, memberId: null, lines: [{ productId: 1, optionIds: [], quantity: 3 }] }

let quotes: ReturnType<typeof mockPriceQuoteRepository>
let orders: ReturnType<typeof mockOrderQuoteSource>
let claims: QuoteClaims

beforeEach(() => {
  quotes = mockPriceQuoteRepository()
  orders = mockOrderQuoteSource()
  claims = new QuoteClaims(quotes, orders, mockClock(now))
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
      return { id: 9, memberId: null, items: [{ productId: 1, productName: 'น้ำดื่ม', sku: 'SKU-1', unitPriceSatang: 1000, quantity: 3, options: [] }] }
    })
    await claims.reserveForQr(5, claim)
    expect(steps).toEqual(['order', 'quote'])

    orders.lockOpenOrder.mockResolvedValue({ id: 9, memberId: null, items: [{ productId: 1, productName: 'น้ำดื่ม', sku: 'SKU-1', unitPriceSatang: 1000, quantity: 4, options: [] }] })
    await expect(claims.reserveForQr(5, claim)).rejects.toMatchObject({ code: 'QUOTE_MISMATCH' })
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
    expect(quotes.save.mock.calls[0]![0]).toMatchObject({ status: 'cancelled' })
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

  test('says which quote a QR holds, only while it is held', async () => {
    quotes.findByQrReference.mockResolvedValueOnce(makePriceQuote({ status: 'reserved', qrReference: 'QRABC' }))
    expect(await claims.findReservedByReference('QRABC')).toBe(5)
    quotes.findByQrReference.mockResolvedValueOnce(makePriceQuote({ status: 'consumed', saleId: 3, qrReference: 'QRABC' }))
    expect(await claims.findReservedByReference('QRABC')).toBeNull()
    expect(await claims.findReservedByReference('QRNONE')).toBeNull()
  })

  test('consuming saves the quote with its sale', async () => {
    await claims.consume(makePriceQuote(), 8)
    expect(quotes.save.mock.calls[0]![0]).toMatchObject({ status: 'consumed', saleId: 8 })
  })
})
