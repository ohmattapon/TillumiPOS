import { beforeEach, describe, expect, test } from 'bun:test'
import { makeBranch, makePriceQuote, makeProduct, makeSale } from '../../../../__tests__/factories'
import {
  mockBranchRepository, mockCheckoutPolicy, mockLineOptionsResolver, mockMemberRepository,
  mockProductRepository, mockQrPaymentClaims, mockQuoteClaims, mockSaleRepository, mockShiftLedger,
  mockShopSettingsRepository, mockStockLedger, mockPriceQuoteRepository, mockOrderQuoteSource, mockClock,
} from '../../../../__tests__/mocks'
import { PriceQuoteEntity } from '../../../../domains/price-quote.domain'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { QuoteClaims } from '../../../quotes/applications/services/quote-claims'
import { SaleCheckout } from './sale-checkout'

const promotion = { id: 4, name: 'ลด 3 บาท', kind: 'fixed' as const, value: 300, maxDiscountSatang: null, discountSatang: 300 }
// 3 x 8.00, less 3.00, VAT included: the price pinned when the shop sold it for 8.00.
const pinned = (overrides = {}) =>
  makePriceQuote({
    id: 7,
    lines: [{ productId: 1, productName: 'น้ำดื่ม', sku: 'SKU-1', unitPriceSatang: 800, quantity: 3, options: [] }],
    subtotalSatang: 2400, discountSatang: 300, promotion, vatSatang: 137, totalSatang: 2100,
    ...overrides,
  })
const cart = { productId: 1, quantity: 3, optionIds: [] as number[] }

describe('SaleCheckout with a pinned price', () => {
  let products: ReturnType<typeof mockProductRepository>
  let members: ReturnType<typeof mockMemberRepository>
  let sales: ReturnType<typeof mockSaleRepository>
  let ledger: ReturnType<typeof mockStockLedger>
  let qr: ReturnType<typeof mockQrPaymentClaims>
  let quotes: ReturnType<typeof mockQuoteClaims>
  let settings: ReturnType<typeof mockShopSettingsRepository>
  let checkout: SaleCheckout
  const request = {
    lines: [cart], discountSatang: 0, quoteId: 7,
    payments: [{ method: 'cash' as const, amountSatang: 2100 }],
    cashier: { id: 1, displayName: 'แคชเชียร์' }, branch: { id: 1, code: 'MAIN' },
  }

  beforeEach(() => {
    products = mockProductRepository()
    members = mockMemberRepository()
    sales = mockSaleRepository()
    ledger = mockStockLedger()
    qr = mockQrPaymentClaims()
    quotes = mockQuoteClaims()
    settings = mockShopSettingsRepository()
    const branches = mockBranchRepository()
    // The shop has since raised the price to 10.00 and moved to VAT added on top.
    settings.get.mockResolvedValue(new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, vatMode: 'exclusive' }))
    branches.findById.mockResolvedValue(makeBranch())
    products.findManyForUpdate.mockResolvedValue([makeProduct({ priceSatang: 1000, stockQty: 10 })])
    quotes.lockForCheckout.mockResolvedValue(pinned())
    sales.nextReceiptNo.mockResolvedValue('MAIN-20261015-00001')
    sales.create.mockImplementation(async (sale, receiptNo) => makeSale({ ...sale, id: 31, receiptNo }))
    checkout = new SaleCheckout(
      sales, products, ledger, settings, qr, mockCheckoutPolicy(), mockShiftLedger(),
      mockLineOptionsResolver(), members, quotes,
    )
  })

  test('sells at the pinned prices, discount, promotion and VAT rules, not the shop’s current ones', async () => {
    const sale = await checkout.checkout(request)

    expect(sale.id).toBe(31)
    const stored = sales.create.mock.calls[0]![0]
    expect(stored).toMatchObject({
      subtotalSatang: 2400, discountSatang: 300, totalSatang: 2100, vatSatang: 137,
      vatMode: 'inclusive', vatRateBp: 700, promotion,
    })
    expect(stored.items[0]).toMatchObject({ unitPriceSatang: 800, quantity: 3, lineTotalSatang: 2400 })
  })

  test('hands the quote the cart it was asked for, and uses it up with the sale', async () => {
    await checkout.checkout(request)

    expect(quotes.lockForCheckout).toHaveBeenCalledWith(7, { branchId: 1, memberId: null, orderId: null, lines: [{ ...cart, packId: null }] }, [])
    expect(quotes.consume).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), 31)
  })

  test('takes the quote’s member without asking whether the member is still active', async () => {
    quotes.lockForCheckout.mockResolvedValue(pinned({ memberId: 8, member: { id: 8, code: 'M000008', name: 'ลูกค้าประจำ' } }))
    const sale = await checkout.checkout({ ...request, memberId: 8 })

    expect(members.findByIdForUpdate).not.toHaveBeenCalled()
    expect(sale.member).toEqual({ id: 8, code: 'M000008', name: 'ลูกค้าประจำ' })
  })

  test("an order's pinned price is held for that order, so it cannot be sold as a cart", async () => {
    await checkout.checkout({ ...request, orderId: 4 })
    expect(quotes.lockForCheckout).toHaveBeenCalledWith(7, { branchId: 1, memberId: null, orderId: 4, lines: [{ ...cart, packId: null }] }, [])
  })

  test('still refuses when there is not enough stock, and writes nothing', async () => {
    products.findManyForUpdate.mockResolvedValue([makeProduct({ stockQty: 2 })])
    await expect(checkout.checkout(request)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
    expect(sales.create).not.toHaveBeenCalled()
    expect(quotes.consume).not.toHaveBeenCalled()
  })

  test('a typed discount cannot be added to a promotion, and nothing is locked first', async () => {
    await expect(checkout.checkout({ ...request, discountSatang: 100 })).rejects.toMatchObject({
      code: 'PROMOTION_AND_DISCOUNT_CONFLICT',
    })
    expect(quotes.lockForCheckout).not.toHaveBeenCalled()
    expect(products.findManyForUpdate).not.toHaveBeenCalled()
  })

  test('a quote that does not fit the sale stops it before any write', async () => {
    quotes.lockForCheckout.mockRejectedValue(Object.assign(new Error('x'), { code: 'QUOTE_MISMATCH' }))
    await expect(checkout.checkout(request)).rejects.toMatchObject({ code: 'QUOTE_MISMATCH' })
    expect(products.findManyForUpdate).not.toHaveBeenCalled()
    expect(sales.nextReceiptNo).not.toHaveBeenCalled()
    expect(ledger.record).not.toHaveBeenCalled()
  })

  test('payments are not enough when they fall short of the pinned total', async () => {
    await expect(
      checkout.checkout({ ...request, payments: [{ method: 'cash', amountSatang: 2099 }] }),
    ).rejects.toMatchObject({ code: 'UNDERPAID' })
    expect(quotes.consume).not.toHaveBeenCalled()
  })

  describe('with a pack', () => {
    const now = new Date('2026-10-15T05:00:00Z')
    // One 6-pack pinned at 6 x 15.00 when the pack had no price of its own.
    const packQuote = () =>
      makePriceQuote({
        ...PriceQuoteEntity.price({
          branchId: 1, memberId: null, member: null, orderId: null, promotion: null, vatMode: 'inclusive', vatRateBp: 700, createdById: 1,
          lines: [{ productId: 1, productName: 'น้ำดื่ม', sku: 'SKU-1', unitPriceSatang: 9000, quantity: 1, options: [], packId: 12, packSize: 6 }],
        }, now),
        id: 7,
      })
    const packRequest = { ...request, lines: [{ productId: 1, quantity: 1, packId: 12 }], payments: [{ method: 'cash' as const, amountSatang: 9000 }] }

    test('sells at the pinned pack price even after the pack was switched off and repriced', async () => {
      quotes.lockForCheckout.mockResolvedValue(packQuote())
      products.findManyForUpdate.mockResolvedValue([
        makeProduct({ priceSatang: 2000, stockQty: 6, packs: [{ id: 12, barcode: 'BOX6', size: 6, priceSatang: 12000, isActive: false }] }),
      ])

      await checkout.checkout(packRequest)

      expect(quotes.lockForCheckout).toHaveBeenCalledWith(
        7, expect.objectContaining({ lines: [{ productId: 1, optionIds: [], quantity: 1, packId: 12 }] }), [],
      )
      const stored = sales.create.mock.calls[0]![0]
      expect(stored).toMatchObject({ subtotalSatang: 9000, totalSatang: 9000 })
      expect(stored.items).toMatchObject([{ productId: 1, quantity: 1, packId: 12, packSize: 6, unitPriceSatang: 9000, lineTotalSatang: 9000 }])
      expect(ledger.record).toHaveBeenCalledWith(expect.objectContaining({ productId: 1, quantity: -6 }))
    })

    test('the pinned pack is checked against the stock in pieces', async () => {
      quotes.lockForCheckout.mockResolvedValue(packQuote())
      products.findManyForUpdate.mockResolvedValue([makeProduct({ stockQty: 5 })])
      await expect(checkout.checkout(packRequest)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
      expect(sales.create).not.toHaveBeenCalled()
    })

    describe('matched by the real quote rules', () => {
      const withRealQuotes = (quote: PriceQuoteEntity) => {
        const repository = mockPriceQuoteRepository()
        repository.findByIdForUpdate.mockResolvedValue(quote)
        return new SaleCheckout(
          sales, products, ledger, settings, qr, mockCheckoutPolicy(), mockShiftLedger(),
          mockLineOptionsResolver(), members, new QuoteClaims(repository, mockOrderQuoteSource(), mockClock(now)),
        )
      }

      test('a pack cannot be sold against a quote for the same number of loose pieces', async () => {
        const pieces = makePriceQuote({ id: 7, lines: [{ productId: 1, productName: 'น้ำดื่ม', sku: 'SKU-1', unitPriceSatang: 1000, quantity: 1, options: [] }], subtotalSatang: 1000, totalSatang: 1000, vatSatang: 65 })
        await expect(withRealQuotes(pieces).checkout(packRequest)).rejects.toMatchObject({ code: 'QUOTE_MISMATCH' })
        expect(products.findManyForUpdate).not.toHaveBeenCalled()
        expect(sales.create).not.toHaveBeenCalled()
      })

      test('loose pieces cannot be sold against a pack quote', async () => {
        const pieceRequest = { ...packRequest, lines: [{ productId: 1, quantity: 1 }] }
        await expect(withRealQuotes(packQuote()).checkout(pieceRequest)).rejects.toMatchObject({ code: 'QUOTE_MISMATCH' })
        expect(products.findManyForUpdate).not.toHaveBeenCalled()
        expect(sales.create).not.toHaveBeenCalled()
      })
    })
  })

  describe('with a QR', () => {
    const withQr = { ...request, payments: [{ method: 'promptpay' as const, amountSatang: 2100, qrPaymentId: 9 }] }

    test('claims the QR before locking the quote, gives the quote its reference, and uses both up', async () => {
      const steps: string[] = []
      qr.assertClaimable.mockImplementation(async () => { steps.push('qr') })
      qr.reference.mockResolvedValue('QRABC')
      quotes.lockForCheckout.mockImplementation(async () => { steps.push('quote'); return pinned({ status: 'reserved', qrReference: 'QRABC' }) })
      products.findManyForUpdate.mockImplementation(async () => { steps.push('products'); return [makeProduct()] })

      await checkout.checkout(withQr)

      expect(steps).toEqual(['qr', 'quote', 'products'])
      expect(quotes.lockForCheckout).toHaveBeenCalledWith(7, expect.anything(), ['QRABC'])
      expect(qr.consume).toHaveBeenCalledWith(9, 31)
      expect(quotes.consume).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), 31)
    })

    test('a QR that holds a quote cannot be used without it', async () => {
      qr.reference.mockResolvedValue('QRABC')
      quotes.findHeldByReference.mockResolvedValue(7)

      const refused = checkout.checkout({ ...withQr, quoteId: undefined })

      await expect(refused).rejects.toMatchObject({ code: 'QUOTE_REQUIRED', params: { quoteId: 7 } })
      expect(sales.create).not.toHaveBeenCalled()
      expect(qr.consume).not.toHaveBeenCalled()
    })
  })
})

describe('SaleCheckout without a quote', () => {
  test('never asks the quotes about a sale that carries none', async () => {
    const products = mockProductRepository()
    const sales = mockSaleRepository()
    const quotes = mockQuoteClaims()
    const settings = mockShopSettingsRepository()
    const branches = mockBranchRepository()
    settings.get.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS))
    branches.findById.mockResolvedValue(makeBranch())
    products.findManyForUpdate.mockResolvedValue([makeProduct()])
    sales.nextReceiptNo.mockResolvedValue('MAIN-20261015-00002')
    sales.create.mockImplementation(async (sale, receiptNo) => makeSale({ ...sale, id: 2, receiptNo }))
    const checkout = new SaleCheckout(
      sales, products, mockStockLedger(), settings, mockQrPaymentClaims(), mockCheckoutPolicy(), mockShiftLedger(),
      mockLineOptionsResolver(), mockMemberRepository(), quotes,
    )

    const sale = await checkout.checkout({
      lines: [{ productId: 1, quantity: 1 }], discountSatang: 0,
      payments: [{ method: 'cash', amountSatang: 1000 }],
      cashier: { id: 1, displayName: 'แคชเชียร์' }, branch: { id: 1, code: 'MAIN' },
    })

    expect(sale.promotion).toBeNull()
    expect(quotes.lockForCheckout).not.toHaveBeenCalled()
    expect(quotes.consume).not.toHaveBeenCalled()
  })
})
