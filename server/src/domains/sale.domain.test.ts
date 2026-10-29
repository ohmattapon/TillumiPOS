import { describe, expect, test } from 'bun:test'
import { makeProduct, makeSale } from '../__tests__/factories'
import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { SaleEntity, type SalePayment } from './sale.domain'

const cashier = { id: 7, displayName: 'สมชาย' }
const cash = (amountSatang: number): SalePayment[] => [{ method: 'cash', amountSatang }]
const line = (priceSatang: number, quantity: number, id = 1) => ({
  product: makeProduct({ id, priceSatang, costSatang: 600, name: `สินค้า ${id}`, sku: `SKU-${id}` }),
  quantity,
})

/** Prices a sale with sensible defaults: one 100.00 line, no discount, 7% VAT, paid exactly in cash. */
const complete = (overrides: Partial<Parameters<typeof SaleEntity.complete>[0]> = {}) =>
  SaleEntity.complete({
    lines: [line(10000, 1)],
    discountSatang: 0,
    payments: cash(10000),
    vatMode: 'inclusive',
    vatRateBp: 700,
    branchId: 1,
    cashier,
    ...overrides,
  })

const codeOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return (error as DomainError).code
  }
}

describe('SaleEntity.complete: totals', () => {
  test('sums lines, applies discount and extracts inclusive VAT', () => {
    const sale = complete({ lines: [line(2500, 2, 1), line(5700, 1, 2)], payments: cash(10700) })

    // 107.00 baht VAT-inclusive contains exactly 7.00 baht of VAT.
    expect(sale).toMatchObject({ subtotalSatang: 10700, discountSatang: 0, totalSatang: 10700, vatSatang: 700 })
  })

  test('computes VAT on the discounted total and rounds to the nearest satang', () => {
    const sale = complete({ discountSatang: 100, payments: cash(9900) })

    expect(sale.totalSatang).toBe(9900)
    expect(sale.vatSatang).toBe(648) // 9900 * 7 / 107 = 647.66
  })

  test('charges no VAT when the rate is zero', () => {
    expect(complete({ vatRateBp: 0 }).vatSatang).toBe(0)
  })

  test('rejects a discount larger than the subtotal', () => {
    const attempt = () => complete({ lines: [line(1000, 1)], discountSatang: 1001, payments: cash(1000) })

    expect(attempt).toThrow(DomainError)
    expect(codeOf(attempt)).toBe('DISCOUNT_TOO_LARGE')
  })

  test('a discount equal to the subtotal makes the sale free', () => {
    const sale = complete({ lines: [line(1000, 1)], discountSatang: 1000, payments: cash(100) })

    expect(sale).toMatchObject({ totalSatang: 0, vatSatang: 0, changeSatang: 100 })
  })
})

describe('SaleEntity.complete: VAT modes', () => {
  test('exclusive adds VAT on top, so the customer owes more than the shelf price', () => {
    const sale = complete({ vatMode: 'exclusive', payments: cash(10700) })

    expect(sale).toMatchObject({ subtotalSatang: 10000, vatSatang: 700, totalSatang: 10700, changeSatang: 0 })
  })

  test('exclusive refuses a payment that only covers the shelf price', () => {
    expect(codeOf(() => complete({ vatMode: 'exclusive', payments: cash(10000) }))).toBe('UNDERPAID')
  })

  test('none charges no VAT and records a rate of zero', () => {
    const sale = complete({ vatMode: 'none', vatRateBp: 700 })

    expect(sale).toMatchObject({ vatSatang: 0, totalSatang: 10000, vatMode: 'none', vatRateBp: 0 })
  })

  test('the sale keeps the mode and rate it was priced with', () => {
    const sale = complete({ vatMode: 'exclusive', vatRateBp: 1000, payments: cash(11000) })

    expect(sale).toMatchObject({ vatMode: 'exclusive', vatRateBp: 1000, vatSatang: 1000 })
  })

  test('exclusive VAT that pushes the total past the ceiling is refused', () => {
    const attempt = () =>
      complete({ vatMode: 'exclusive', lines: [line(2_100_000_000, 1)], payments: cash(2_147_483_647) })

    expect(codeOf(attempt)).toBe('AMOUNT_TOO_LARGE')
  })
})

describe('SaleEntity.complete: payment', () => {
  test('returns change from cash', () => {
    const sale = complete({ lines: [line(8500, 1)], payments: cash(10000) })

    expect(sale).toMatchObject({ paidSatang: 10000, changeSatang: 1500 })
  })

  test('accepts split payments that add up exactly', () => {
    const sale = complete({
      payments: [
        { method: 'promptpay', amountSatang: 6000 },
        { method: 'cash', amountSatang: 4000 },
      ],
    })

    expect(sale.changeSatang).toBe(0)
    expect(sale.payments).toHaveLength(2)
  })

  test('rejects underpayment', () => {
    const attempt = () => complete({ payments: cash(9999) })

    expect(attempt).toThrow(DomainError)
    expect(codeOf(attempt)).toBe('UNDERPAID')
  })

  test('rejects change that cash cannot cover', () => {
    const byCardOnly = () => complete({ payments: [{ method: 'card', amountSatang: 12000 }] })
    const mostlyCard = () =>
      complete({
        payments: [
          { method: 'card', amountSatang: 11000 },
          { method: 'cash', amountSatang: 500 },
        ],
      })

    expect(codeOf(byCardOnly)).toBe('OVERPAID')
    expect(codeOf(mostlyCard)).toBe('OVERPAID')
  })
})

describe('SaleEntity.complete: amount ceiling', () => {
  test('refuses a subtotal beyond what the system can store', () => {
    const attempt = () => complete({ lines: [line(2_000_000_000, 2)], payments: cash(2_000_000_000) })

    expect(attempt).toThrow('ยอดเงินเกินกว่าที่ระบบรองรับ')
    expect(codeOf(attempt)).toBe('AMOUNT_TOO_LARGE')
  })

  test('refuses a tendered amount beyond the ceiling even when the total is small', () => {
    const attempt = () =>
      complete({
        payments: [
          { method: 'cash', amountSatang: 2_000_000_000 },
          { method: 'cash', amountSatang: 2_000_000_000 },
        ],
      })

    expect(codeOf(attempt)).toBe('AMOUNT_TOO_LARGE')
  })

  test('accepts a sale exactly at the ceiling', () => {
    const sale = complete({ lines: [line(2_147_483_647, 1)], payments: cash(2_147_483_647) })

    expect(sale.totalSatang).toBe(2_147_483_647)
  })
})

describe('SaleEntity.complete: lines', () => {
  test('keeps the shift that owns a v2 sale', () => {
    expect(complete({ shiftId: 42 } as never)).toMatchObject({ shiftId: 42 })
  })

  test('snapshots name, SKU, price and cost of each product, and records the cashier', () => {
    const sale = complete({ lines: [line(2500, 2, 4)], payments: cash(5000) })

    expect(sale.items).toEqual([
      {
        productId: 4,
        productName: 'สินค้า 4',
        sku: 'SKU-4',
        unitPriceSatang: 2500,
        unitCostSatang: 600,
        quantity: 2,
        lineTotalSatang: 5000,
        packId: null,
        packSize: 1,
        options: [],
        categoryId: null,
        allocatedTotalSatang: 5000,
        allocatedVatSatang: 327,
      },
    ])
    expect(sale).toMatchObject({ cashierId: 7, cashierName: 'สมชาย' })
  })

  test.each([
    ['no lines', { lines: [] }, 'EMPTY_SALE'],
    ['a zero quantity', { lines: [line(1000, 0)] }, 'INVALID_QUANTITY'],
    ['a fractional quantity', { lines: [line(1000, 1.5)] }, 'INVALID_QUANTITY'],
    ['a negative discount', { discountSatang: -1 }, 'INVALID_DISCOUNT'],
    ['a zero payment', { payments: cash(0) }, 'INVALID_PAYMENT'],
    ['a fractional payment', { payments: cash(100.5) }, 'INVALID_PAYMENT'],
  ])('rejects %s', (_label, overrides, code) => {
    expect(codeOf(() => complete(overrides))).toBe(code)
  })
})

describe('SaleEntity.void', () => {
  const at = new Date('2026-10-13T08:00:00Z')

  test('returns a voided copy that records who, when and why, and leaves the original alone', () => {
    const sale = makeSale()

    const voided = sale.void('คิดเงินผิด', 9, at)

    expect(voided.toSnapshot()).toMatchObject({ status: 'voided', voidedById: 9, voidedAt: at, voidReason: 'คิดเงินผิด' })
    expect(voided.items).toEqual(sale.items)
    expect(voided.totalSatang).toBe(sale.totalSatang)
    expect(sale.status).toBe('completed')
  })

  test('a sale can be voided only once', () => {
    const attempt = () => makeSale().void('ครั้งแรก', 9, at).void('ครั้งที่สอง', 9, at)

    expect(attempt).toThrow(DomainConflictError)
    expect(attempt).toThrow('บิลนี้ถูกยกเลิกไปแล้ว')
    expect(codeOf(attempt)).toBe('ALREADY_VOIDED')
  })

  test.each(['', 'x'.repeat(501)])('rejects a reason of length %#: empty or over 500 characters', (reason) => {
    expect(() => makeSale().void(reason, 9, at)).toThrow(DomainError)
  })
})

describe('SaleEntity', () => {
  test('a voided sale must carry the time it was voided', () => {
    expect(() => makeSale({ status: 'voided', voidedAt: null })).toThrow(DomainError)
  })

  test('toSnapshot returns copies, so callers cannot change the sale through it', () => {
    const sale = makeSale()

    sale.toSnapshot().items[0]!.quantity = 999

    expect(sale.items[0]!.quantity).toBe(3)
  })
})

describe('SaleEntity.complete with options', () => {
  const pearls = { groupId: 2, groupName: 'ท็อปปิง', optionId: 20, name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 }

  test('a line sells and costs the product plus its options, and keeps them', () => {
    const tea = makeProduct({ id: 1, priceSatang: 5000, costSatang: 2000 })

    const sale = complete({
      lines: [
        { product: tea, quantity: 2, options: [pearls] },
        { product: tea, quantity: 1 },
      ],
      payments: cash(17000),
      vatMode: 'none',
      vatRateBp: 0,
    })

    expect(sale.items).toEqual([
      expect.objectContaining({ unitPriceSatang: 6000, unitCostSatang: 2400, quantity: 2, lineTotalSatang: 12000, options: [pearls] }),
      expect.objectContaining({ unitPriceSatang: 5000, unitCostSatang: 2000, quantity: 1, lineTotalSatang: 5000, options: [] }),
    ])
    expect(sale.subtotalSatang).toBe(17000)
  })

  test('a sale restored from a snapshot made before options existed has lines without options', () => {
    const legacy = makeSale().toSnapshot()
    const { options: _options, ...bareItem } = legacy.items[0]!

    const restored = new SaleEntity({ ...legacy, items: [bareItem as (typeof legacy.items)[number]] })

    expect(restored.items[0]!.options).toEqual([])
  })
})


describe('sale membership snapshot', () => {
  test('copies only receipt identity without retaining mutable member data', () => {
    const member = { id: 7, code: 'M000007', name: 'Original', phone: '0812345678' }
    const priced = complete({ member })
    member.name = 'Changed'
    expect(priced.member).toEqual({ id: 7, code: 'M000007', name: 'Original' })
    const sale = makeSale({ member: priced.member })
    const snapshot = sale.toSnapshot()
    snapshot.member!.name = 'Edited snapshot'
    expect(sale.member!.name).toBe('Original')
    expect(sale.void('reason', 1, new Date()).member).toEqual(sale.member)
  })
  test('old sales and anonymous checkout expose null membership', () => {
    expect(complete().member).toBeNull()
    expect(makeSale().member).toBeNull()
  })
})

describe('SaleEntity.complete: line snapshots for reports', () => {
  const twoLines = () => [
    { product: makeProduct({ id: 1, priceSatang: 600, categoryId: 5, name: 'A', sku: 'A' }), quantity: 1 },
    { product: makeProduct({ id: 2, priceSatang: 400, categoryId: null, name: 'B', sku: 'B' }), quantity: 1 },
  ]

  test('gives each line a share of the discounted total and VAT that adds up to the bill', () => {
    const sale = complete({ lines: twoLines(), discountSatang: 100, payments: cash(900) })

    expect(sale.totalSatang).toBe(900)
    expect(sale.items.reduce((sum, item) => sum + item.allocatedTotalSatang!, 0)).toBe(sale.totalSatang)
    expect(sale.items.reduce((sum, item) => sum + item.allocatedVatSatang!, 0)).toBe(sale.vatSatang)
    expect(sale.items.map((item) => item.allocatedTotalSatang)).toEqual([540, 360])
  })

  test("keeps each product's category as it was sold, including none", () => {
    const sale = complete({ lines: twoLines(), discountSatang: 100, payments: cash(900) })

    expect(sale.items.map((item) => item.categoryId)).toEqual([5, null])
  })

  test('a restored line stored before these existed reads null', () => {
    const { allocatedTotalSatang, allocatedVatSatang, categoryId } = makeSale().items[0]!

    expect({ allocatedTotalSatang, allocatedVatSatang, categoryId }).toEqual({
      allocatedTotalSatang: null,
      allocatedVatSatang: null,
      categoryId: null,
    })
  })
})
