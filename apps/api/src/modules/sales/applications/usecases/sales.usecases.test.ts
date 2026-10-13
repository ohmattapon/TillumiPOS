import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeProduct, makeSale, makeStockMovement } from '../../../../__tests__/factories'
import {
  mockProductRepository,
  mockSaleRepository,
  mockQrPaymentClaims,
  mockShopSettingsRepository,
  mockStockLedger,
  mockUnitOfWork,
} from '../../../../__tests__/mocks'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IClock } from '../../../shared/ports/clock.port'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { SaleCheckout } from '../services/sale-checkout'
import { CompleteSaleUseCase } from './complete-sale.usecase'
import { GetSaleUseCase } from './get-sale.usecase'
import { GetSalesSummaryUseCase } from './get-sales-summary.usecase'
import { ListSalesUseCase } from './list-sales.usecase'
import { VoidSaleUseCase } from './void-sale.usecase'

const cashier = { id: 7, displayName: 'สมชาย' }
const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]

let sales: ReturnType<typeof mockSaleRepository>
let products: ReturnType<typeof mockProductRepository>
let ledger: ReturnType<typeof mockStockLedger>
let unitOfWork: ReturnType<typeof mockUnitOfWork>
let settings: ReturnType<typeof mockShopSettingsRepository>
let qrPayments: ReturnType<typeof mockQrPaymentClaims>

beforeEach(() => {
  sales = mockSaleRepository()
  products = mockProductRepository()
  ledger = mockStockLedger()
  unitOfWork = mockUnitOfWork()
  settings = mockShopSettingsRepository()
  qrPayments = mockQrPaymentClaims()
  settings.get.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS))
  ledger.record.mockResolvedValue(makeStockMovement())
})

describe('CompleteSaleUseCase', () => {
  let useCase: CompleteSaleUseCase
  const tea = makeProduct({ id: 1, name: 'ชา', sku: 'TEA', priceSatang: 2500, stockQty: 10 })
  const cake = makeProduct({ id: 2, name: 'เค้ก', sku: 'CAKE', priceSatang: 5700, stockQty: 5 })

  beforeEach(() => {
    products.findManyForUpdate.mockResolvedValue([tea, cake])
    sales.nextReceiptNo.mockResolvedValue('MAIN-20261013-00042')
    sales.create.mockImplementation(async (sale, receiptNo) =>
      makeSale({ ...sale, id: 15, receiptNo, status: 'completed', voidedById: null, voidedAt: null, voidReason: null }),
    )
    useCase = new CompleteSaleUseCase(new SaleCheckout(sales, products, ledger, settings, qrPayments), unitOfWork)
  })

  const sell = (overrides: Record<string, unknown> = {}) =>
    useCase.execute(
      {
        items: [
          { productId: 1, quantity: 2 },
          { productId: 2, quantity: 1 },
        ],
        discountSatang: 700,
        payments: cash(20000),
        ...overrides,
      },
      cashier,
      { id: 1, code: 'MAIN' },
    )

  test('prices the sale with the shop VAT rate, stores it and returns it with its receipt number', async () => {
    const sale = await sell()

    expect(sale.toSnapshot()).toMatchObject({
      id: 15,
      receiptNo: 'MAIN-20261013-00042',
      subtotalSatang: 10700,
      discountSatang: 700,
      totalSatang: 10000,
      vatSatang: 654,
      paidSatang: 20000,
      changeSatang: 10000,
      cashierId: 7,
      cashierName: 'สมชาย',
    })
    expect(unitOfWork.run).toHaveBeenCalledTimes(1)
  })

  test('prices with the settings in force: exclusive VAT is added on top and recorded on the sale', async () => {
    settings.get.mockResolvedValue(new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, vatMode: 'exclusive', vatRateBp: 1000 }))

    // 107.00 - 7.00 discount = 100.00 net, plus 10% = 110.00
    const sale = await sell({ payments: cash(20000) })

    expect(sale.toSnapshot()).toMatchObject({
      subtotalSatang: 10700,
      discountSatang: 700,
      vatSatang: 1000,
      totalSatang: 11000,
      changeSatang: 9000,
      vatMode: 'exclusive',
      vatRateBp: 1000,
    })
  })

  test('a shop that does not charge VAT records none', async () => {
    settings.get.mockResolvedValue(new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, vatMode: 'none' }))

    const sale = await sell()

    expect(sale.toSnapshot()).toMatchObject({ vatSatang: 0, totalSatang: 10000, vatMode: 'none', vatRateBp: 0 })
  })

  test('reads the settings inside the unit of work, so the sale and its pricing see the same state', async () => {
    await sell()

    expect(unitOfWork.run.mock.invocationCallOrder[0]).toBeLessThan(settings.get.mock.invocationCallOrder[0]!)
  })

  test('a failure reading the settings propagates and stores nothing', async () => {
    const failure = new Error('database went away')
    settings.get.mockRejectedValue(failure)

    await expect(sell()).rejects.toBe(failure)
    expect(sales.create).not.toHaveBeenCalled()
  })

  test('locks every product in the cart before checking stock', async () => {
    await sell()

    expect(products.findManyForUpdate).toHaveBeenCalledWith([1, 2], 1)
  })

  test('deducts each line from stock, referencing the receipt and the cashier', async () => {
    await sell()

    expect(ledger.record.mock.calls.map(([movement]) => movement)).toEqual([
      { branchId: 1, productId: 1, type: 'sale', quantity: -2, reference: 'MAIN-20261013-00042', userId: 7 },
      { branchId: 1, productId: 2, type: 'sale', quantity: -1, reference: 'MAIN-20261013-00042', userId: 7 },
    ])
  })

  test('merges repeated lines for one product, keeping first-seen order', async () => {
    const sale = await sell({
      items: [
        { productId: 2, quantity: 1 },
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 2 },
      ],
      discountSatang: 0,
    })

    expect(sale.items.map((item) => [item.productId, item.quantity])).toEqual([
      [2, 3],
      [1, 1],
    ])
    expect(products.findManyForUpdate).toHaveBeenCalledWith([2, 1], 1)
  })

  test('merged quantities are what is checked against stock', async () => {
    const attempt = sell({
      items: [
        { productId: 2, quantity: 3 },
        { productId: 2, quantity: 3 },
      ],
    })

    await expect(attempt).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  })

  describe('refuses, storing nothing and taking no receipt number', () => {
    const expectNothingStored = () => {
      expect(sales.nextReceiptNo).not.toHaveBeenCalled()
      expect(sales.create).not.toHaveBeenCalled()
      expect(ledger.record).not.toHaveBeenCalled()
    }

    test('a product that does not exist', async () => {
      products.findManyForUpdate.mockResolvedValue([tea])

      await expect(sell()).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND', message: 'ไม่พบสินค้ารหัส 2' })
      expectNothingStored()
    })

    test('an inactive product', async () => {
      products.findManyForUpdate.mockResolvedValue([tea, makeProduct({ id: 2, name: 'เค้ก', isActive: false })])

      const attempt = sell()

      await expect(attempt).rejects.toBeInstanceOf(DomainConflictError)
      await expect(attempt).rejects.toMatchObject({ code: 'PRODUCT_INACTIVE', message: 'สินค้า "เค้ก" ปิดการขายแล้ว' })
      expectNothingStored()
    })

    test('more than is in stock', async () => {
      products.findManyForUpdate.mockResolvedValue([makeProduct({ id: 1, name: 'ชา', stockQty: 1 }), cake])

      await expect(sell()).rejects.toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        message: 'สินค้า "ชา" เหลือ 1 ชิ้น ไม่พอขาย',
      })
      expectNothingStored()
    })

    test.each([
      ['an underpayment', { payments: cash(9999) }, 'UNDERPAID'],
      ['a non-cash overpayment', { payments: [{ method: 'card', amountSatang: 20000 }] }, 'OVERPAID'],
      ['a discount above the subtotal', { discountSatang: 10701 }, 'DISCOUNT_TOO_LARGE'],
    ])('%s', async (_label, overrides, code) => {
      await expect(sell(overrides)).rejects.toMatchObject({ code })
      expectNothingStored()
    })
  })

  test('the first problem in cart order is the one reported', async () => {
    products.findManyForUpdate.mockResolvedValue([makeProduct({ id: 1, name: 'ชา', stockQty: 0 })])

    // Line 1 is out of stock and line 2 does not exist: line 1 comes first.
    await expect(sell()).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  })

  test.each([
    ['an empty cart', { items: [] }],
    ['a zero quantity', { items: [{ productId: 1, quantity: 0 }] }],
    ['a fractional quantity', { items: [{ productId: 1, quantity: 1.5 }] }],
    ['no payment', { payments: [] }],
    ['an unknown payment method', { payments: [{ method: 'crypto', amountSatang: 100 }] }],
    ['a negative discount', { discountSatang: -1 }],
  ])('rejects %s before opening a unit of work', async (_label, overrides) => {
    await expect(sell(overrides)).rejects.toBeInstanceOf(ZodError)
    expect(unitOfWork.run).not.toHaveBeenCalled()
  })

  test('a failure while deducting stock propagates, so the unit of work rolls the sale back', async () => {
    const failure = new Error('database went away')
    ledger.record.mockRejectedValue(failure)

    await expect(sell()).rejects.toBe(failure)
  })
})

describe('QR payments in a sale', () => {
  let useCase: CompleteSaleUseCase
  const tea = makeProduct({ id: 1, name: 'ชา', sku: 'TEA', priceSatang: 10000, stockQty: 10 })
  const cashier = { id: 7, displayName: 'สมชาย' }
  const branch = { id: 1, code: 'MAIN' }
  const sellWith = (payments: unknown[]) =>
    useCase.execute({ items: [{ productId: 1, quantity: 1 }], payments }, cashier, branch)

  beforeEach(() => {
    products.findManyForUpdate.mockResolvedValue([tea])
    sales.nextReceiptNo.mockResolvedValue('MAIN-20261013-00042')
    sales.create.mockImplementation(async (sale, receiptNo) =>
      makeSale({ ...sale, id: 15, receiptNo, status: 'completed', voidedById: null, voidedAt: null, voidReason: null }),
    )
    useCase = new CompleteSaleUseCase(new SaleCheckout(sales, products, ledger, settings, qrPayments), unitOfWork)
  })

  test('a promptpay payment backed by a QR is checked for this branch and amount, then used by the sale', async () => {
    qrPayments.isRequired.mockReturnValue(true)

    const sale = await sellWith([{ method: 'promptpay', amountSatang: 10000, qrPaymentId: 9 }])

    expect(qrPayments.assertClaimable).toHaveBeenCalledWith(9, { branchId: 1, amountSatang: 10000 })
    expect(qrPayments.consume).toHaveBeenCalledWith(9, 15)
    expect(sale.payments).toEqual([{ method: 'promptpay', amountSatang: 10000 }])
  })

  test('when QR payment is configured, promptpay without a confirmed QR is refused and nothing is stored', async () => {
    qrPayments.isRequired.mockReturnValue(true)

    await expect(sellWith([{ method: 'promptpay', amountSatang: 10000 }])).rejects.toMatchObject({
      code: 'QR_PAYMENT_REQUIRED',
    })
    expect(sales.create).not.toHaveBeenCalled()
    expect(ledger.record).not.toHaveBeenCalled()
  })

  test('without QR payment configured, promptpay is taken on trust as before', async () => {
    qrPayments.isRequired.mockReturnValue(false)

    await sellWith([{ method: 'promptpay', amountSatang: 10000 }])

    expect(qrPayments.assertClaimable).not.toHaveBeenCalled()
    expect(sales.create).toHaveBeenCalled()
  })

  test('a QR that cannot be used stops the sale before anything is stored', async () => {
    const refused = new DomainConflictError('ถูกใช้แล้ว', 'QR_ALREADY_USED')
    qrPayments.assertClaimable.mockRejectedValue(refused)

    await expect(sellWith([{ method: 'promptpay', amountSatang: 10000, qrPaymentId: 9 }])).rejects.toBe(refused)
    expect(sales.create).not.toHaveBeenCalled()
    expect(qrPayments.consume).not.toHaveBeenCalled()
  })

  test('a QR id on a cash payment is refused', async () => {
    await expect(sellWith([{ method: 'cash', amountSatang: 10000, qrPaymentId: 9 }])).rejects.toMatchObject({
      code: 'QR_PAYMENT_REQUIRED',
    })
  })

  test('the same QR cannot back two payments of one sale', async () => {
    await expect(
      sellWith([
        { method: 'promptpay', amountSatang: 5000, qrPaymentId: 9 },
        { method: 'promptpay', amountSatang: 5000, qrPaymentId: 9 },
      ]),
    ).rejects.toMatchObject({ code: 'QR_ALREADY_USED' })
  })
})

describe('VoidSaleUseCase', () => {
  let useCase: VoidSaleUseCase
  const now = new Date('2026-10-13T08:00:00Z')
  const clock: IClock = { now: () => now }
  const twoLines = () =>
    makeSale({
      id: 15,
      items: [
        { productId: 5, productName: 'เค้ก', sku: 'CAKE', unitPriceSatang: 1000, unitCostSatang: 600, quantity: 1, lineTotalSatang: 1000 },
        { productId: 2, productName: 'ชา', sku: 'TEA', unitPriceSatang: 1000, unitCostSatang: 600, quantity: 2, lineTotalSatang: 2000 },
      ],
    })

  beforeEach(() => {
    sales.findByIdForUpdate.mockResolvedValue(twoLines())
    useCase = new VoidSaleUseCase(sales, ledger, unitOfWork, clock)
  })

  test('voids the sale with the reason, user and current time, inside one unit of work', async () => {
    const voided = await useCase.execute(15, { reason: 'คิดเงินผิด' }, { id: 9 }, 1)

    expect(voided.toSnapshot()).toMatchObject({ status: 'voided', voidReason: 'คิดเงินผิด', voidedById: 9, voidedAt: now })
    expect(sales.findByIdForUpdate).toHaveBeenCalledWith(15)
    expect(sales.saveVoid).toHaveBeenCalledWith(voided)
    expect(unitOfWork.run).toHaveBeenCalledTimes(1)
  })

  test('returns every line to stock in product-id order, referencing the receipt and the reason', async () => {
    await useCase.execute(15, { reason: 'คิดเงินผิด' }, { id: 9 }, 1)

    expect(ledger.record.mock.calls.map(([movement]) => movement)).toEqual([
      { branchId: 1, productId: 2, type: 'void', quantity: 2, reference: 'MAIN-20261013-00001', note: 'คิดเงินผิด', userId: 9 },
      { branchId: 1, productId: 5, type: 'void', quantity: 1, reference: 'MAIN-20261013-00001', note: 'คิดเงินผิด', userId: 9 },
    ])
  })

  test("another branch's sale cannot be voided, and nothing is returned to stock", async () => {
    sales.findByIdForUpdate.mockResolvedValue(makeSale({ id: 15, branchId: 2 }))

    await expect(useCase.execute(15, { reason: 'คิดเงินผิด' }, { id: 9 }, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(sales.saveVoid).not.toHaveBeenCalled()
    expect(ledger.record).not.toHaveBeenCalled()
  })

  test("stock goes back to the sale's own branch", async () => {
    sales.findByIdForUpdate.mockResolvedValue(makeSale({ id: 15, branchId: 2 }))

    await useCase.execute(15, { reason: 'คิดเงินผิด' }, { id: 9 }, 2)

    expect(ledger.record.mock.calls.every(([movement]) => movement.branchId === 2)).toBe(true)
  })

  test('the returned sale keeps its lines in receipt order', async () => {
    const voided = await useCase.execute(15, { reason: 'คิดเงินผิด' }, { id: 9 }, 1)

    expect(voided.items.map((item) => item.productId)).toEqual([5, 2])
  })

  test('an unknown sale is not found', async () => {
    sales.findByIdForUpdate.mockResolvedValue(null)

    const attempt = useCase.execute(9999, { reason: 'ไม่มี' }, { id: 9 }, 1)

    await expect(attempt).rejects.toBeInstanceOf(DomainNotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'ไม่พบบิลขาย' })
  })

  test('an already voided sale is refused, and no stock is returned a second time', async () => {
    sales.findByIdForUpdate.mockResolvedValue(twoLines().void('ครั้งแรก', 9, now))

    await expect(useCase.execute(15, { reason: 'อีกครั้ง' }, { id: 9 }, 1)).rejects.toMatchObject({ code: 'ALREADY_VOIDED' })
    expect(sales.saveVoid).not.toHaveBeenCalled()
    expect(ledger.record).not.toHaveBeenCalled()
  })

  test.each([[{ reason: '' }], [{ reason: 'x'.repeat(501) }], [{}]])('rejects the input %p', async (input) => {
    await expect(useCase.execute(15, input, { id: 9 }, 1)).rejects.toBeInstanceOf(ZodError)
    expect(unitOfWork.run).not.toHaveBeenCalled()
  })
})

describe('GetSaleUseCase', () => {
  test('returns the sale, or not found', async () => {
    const stored = makeSale()
    sales.findById.mockResolvedValueOnce(stored).mockResolvedValueOnce(null)
    const useCase = new GetSaleUseCase(sales)

    expect(await useCase.execute(1, 1)).toBe(stored)
    await expect(useCase.execute(9999, 1)).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'ไม่พบบิลขาย' })
  })

  test("another branch's sale is reported as not found", async () => {
    sales.findById.mockResolvedValue(makeSale({ branchId: 2 }))

    await expect(new GetSaleUseCase(sales).execute(1, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('ListSalesUseCase', () => {
  test('passes the validated query to the repository', async () => {
    sales.findHeaders.mockResolvedValue({ items: [], total: 0 })
    const from = new Date('2026-10-13T00:00:00Z')

    await new ListSalesUseCase(sales).execute({ from, limit: 20, extra: true }, 1)

    expect(sales.findHeaders).toHaveBeenCalledWith({ from, limit: 20, branchId: 1 })
  })

  test('rejects a limit over 500 and a date that is not a Date', async () => {
    const useCase = new ListSalesUseCase(sales)

    await expect(useCase.execute({ limit: 501 }, 1)).rejects.toBeInstanceOf(ZodError)
    await expect(useCase.execute({ from: '2026-10-13' }, 1)).rejects.toBeInstanceOf(ZodError)
  })
})

describe('GetSalesSummaryUseCase', () => {
  const period = { from: new Date('2026-10-13T00:00:00Z'), to: new Date('2026-10-14T00:00:00Z') }

  test('derives profit from cost, and takes the change off the cash tendered', async () => {
    sales.sumCompleted.mockResolvedValue({
      saleCount: 2,
      totalSatang: 7000,
      vatSatang: 458,
      discountSatang: 500,
      changeSatang: 500,
      costSatang: 4500,
      tendered: [
        { method: 'cash', amountSatang: 5000 },
        { method: 'promptpay', amountSatang: 2500 },
      ],
    })

    const summary = await new GetSalesSummaryUseCase(sales).execute(period, 1)

    expect(summary).toEqual({
      saleCount: 2,
      totalSatang: 7000,
      vatSatang: 458,
      discountSatang: 500,
      profitSatang: 2500,
      byMethod: [
        { method: 'cash', amountSatang: 4500 },
        { method: 'promptpay', amountSatang: 2500 },
      ],
    })
    expect(sales.sumCompleted).toHaveBeenCalledWith({ ...period, branchId: 1 })
  })

  test('a period without sales is all zeros', async () => {
    sales.sumCompleted.mockResolvedValue({
      saleCount: 0,
      totalSatang: 0,
      vatSatang: 0,
      discountSatang: 0,
      changeSatang: 0,
      costSatang: 0,
      tendered: [],
    })

    expect(await new GetSalesSummaryUseCase(sales).execute(period, 1)).toEqual({
      saleCount: 0,
      totalSatang: 0,
      vatSatang: 0,
      discountSatang: 0,
      profitSatang: 0,
      byMethod: [],
    })
  })

  test('requires both ends of the period', async () => {
    await expect(new GetSalesSummaryUseCase(sales).execute({ from: period.from }, 1)).rejects.toBeInstanceOf(ZodError)
  })
})
