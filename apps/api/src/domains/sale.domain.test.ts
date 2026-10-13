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
    vatRateBp: 700,
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
