import { beforeEach, describe, expect, test } from 'bun:test'
import { makeProduct, makeSale } from '../../../../__tests__/factories'
import {
  mockCheckoutPolicy, mockLineOptionsResolver, mockMemberRepository, mockProductRepository, mockQrPaymentClaims,
  mockQuoteClaims, mockSaleRepository, mockShiftLedger, mockShopSettingsRepository, mockStockLedger,
} from '../../../../__tests__/mocks'
import { DomainError } from '../../../../domains/errors/domain-error'
import type { ProductPack } from '../../../../domains/product-pack'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import type { CheckoutLine } from '../ports/sale-checkout.port'
import { SaleCheckout } from './sale-checkout'

const pack = (overrides: Partial<ProductPack> = {}): ProductPack => ({
  id: 7, barcode: 'BOX6', size: 6, priceSatang: 8500, isActive: true, ...overrides,
})

describe('SaleCheckout packs', () => {
  let products: ReturnType<typeof mockProductRepository>
  let ledger: ReturnType<typeof mockStockLedger>
  let lineOptions: ReturnType<typeof mockLineOptionsResolver>
  let sales: ReturnType<typeof mockSaleRepository>
  let checkout: SaleCheckout

  const stocked = (stockQty: number, packs: ProductPack[] = [pack()]) =>
    products.findManyForUpdate.mockResolvedValue([makeProduct({ id: 1, priceSatang: 1500, costSatang: 1000, stockQty, packs })])

  const sell = (lines: CheckoutLine[], amountSatang = 100_000) =>
    checkout.checkout({
      lines, discountSatang: 0, payments: [{ method: 'cash', amountSatang }],
      cashier: { id: 1, displayName: 'แคชเชียร์' }, branch: { id: 1, code: 'MAIN' },
    })

  const codeOf = async (work: Promise<unknown>) => {
    try {
      await work
    } catch (error) {
      return (error as DomainError).code
    }
    throw new Error('expected a rejection')
  }

  beforeEach(() => {
    const settings = mockShopSettingsRepository()
    settings.get.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS))
    products = mockProductRepository()
    ledger = mockStockLedger()
    lineOptions = mockLineOptionsResolver()
    sales = mockSaleRepository()
    sales.nextReceiptNo.mockResolvedValue('MAIN-20261017-00001')
    sales.create.mockImplementation(async (sale, receiptNo) => makeSale({ ...sale, id: 1, receiptNo }))
    checkout = new SaleCheckout(
      sales, products, ledger, settings, mockQrPaymentClaims(), mockCheckoutPolicy(), mockShiftLedger(),
      lineOptions, mockMemberRepository(), mockQuoteClaims(),
    )
  })

  test('a pack and loose pieces of one product take their pieces out of the stock', async () => {
    stocked(12)

    const sale = await sell([{ productId: 1, quantity: 1, packId: 7 }, { productId: 1, quantity: 6 }])

    expect(sale.items).toMatchObject([
      { productId: 1, quantity: 1, packId: 7, packSize: 6, unitPriceSatang: 8500, unitCostSatang: 6000 },
      { productId: 1, quantity: 6, packId: null, packSize: 1, unitPriceSatang: 1500 },
    ])
    const moved = ledger.record.mock.calls.map(([movement]) => movement.quantity)
    expect(moved.reduce((total, quantity) => total + quantity, 0)).toBe(-12)
  })

  test('stock is checked in pieces across pack and piece lines', async () => {
    stocked(11)

    expect(await codeOf(sell([{ productId: 1, quantity: 1, packId: 7 }, { productId: 1, quantity: 6 }]))).toBe('INSUFFICIENT_STOCK')
    expect(sales.create).not.toHaveBeenCalled()
  })

  test('a pack without its own price costs its pieces at the product price', async () => {
    stocked(12, [pack({ priceSatang: null })])

    const sale = await sell([{ productId: 1, quantity: 1, packId: 7 }])

    expect(sale.items[0]).toMatchObject({ unitPriceSatang: 9000, lineTotalSatang: 9000 })
  })

  test('an inactive pack cannot be sold', async () => {
    stocked(12, [pack({ isActive: false })])

    expect(await codeOf(sell([{ productId: 1, quantity: 1, packId: 7 }]))).toBe('PACK_INACTIVE')
  })

  test('an unknown pack cannot be sold', async () => {
    stocked(12)

    expect(await codeOf(sell([{ productId: 1, quantity: 1, packId: 99 }]))).toBe('PACK_NOT_FOUND')
  })

  test('a pack line cannot carry options', async () => {
    stocked(12)

    expect(await codeOf(sell([{ productId: 1, quantity: 1, packId: 7, optionIds: [3] }]))).toBe('PACK_WITH_OPTIONS')
  })

  test('a pack of a product with a required option group is refused like a plain line', async () => {
    stocked(12)
    lineOptions.resolve.mockRejectedValue(new DomainError('กรุณาเลือก "ระดับความหวาน"', 'MODIFIER_REQUIRED'))

    expect(await codeOf(sell([{ productId: 1, quantity: 1, packId: 7 }]))).toBe('MODIFIER_REQUIRED')
    expect(lineOptions.resolve).toHaveBeenCalledWith(1, [])
  })

  test('the same pack scanned twice is one bill line', async () => {
    stocked(12)

    const sale = await sell([{ productId: 1, quantity: 1, packId: 7 }, { productId: 1, quantity: 1, packId: 7 }])

    expect(sale.items).toHaveLength(1)
    expect(sale.items[0]).toMatchObject({ packId: 7, quantity: 2, lineTotalSatang: 17000 })
    expect(ledger.record.mock.calls.map(([movement]) => movement.quantity)).toEqual([-12])
  })
})
