import { describe, expect, test } from 'bun:test'
import { calculateTotals, settlePayments } from './pricing'

describe('calculateTotals', () => {
  test('sums lines, applies discount and extracts inclusive VAT', () => {
    const totals = calculateTotals(
      [
        { unitPriceSatang: 2500, quantity: 2 },
        { unitPriceSatang: 5700, quantity: 1 },
      ],
      0,
      700,
    )
    // 107.00 baht VAT-inclusive contains exactly 7.00 baht of VAT.
    expect(totals).toEqual({ subtotalSatang: 10700, discountSatang: 0, totalSatang: 10700, vatSatang: 700 })
  })

  test('computes VAT on the discounted total and rounds to the nearest satang', () => {
    const totals = calculateTotals([{ unitPriceSatang: 10000, quantity: 1 }], 100, 700)
    expect(totals.totalSatang).toBe(9900)
    expect(totals.vatSatang).toBe(648) // 9900 * 7 / 107 = 647.66
  })

  test('charges no VAT when the rate is zero', () => {
    expect(calculateTotals([{ unitPriceSatang: 10000, quantity: 1 }], 0, 0).vatSatang).toBe(0)
  })

  test('rejects a discount larger than the subtotal', () => {
    expect(() => calculateTotals([{ unitPriceSatang: 1000, quantity: 1 }], 1001, 700)).toThrow()
  })
})

describe('settlePayments', () => {
  test('returns change from cash', () => {
    expect(settlePayments(8500, [{ method: 'cash', amountSatang: 10000 }])).toEqual({
      paidSatang: 10000,
      changeSatang: 1500,
    })
  })

  test('accepts split payments that add up exactly', () => {
    const result = settlePayments(10000, [
      { method: 'promptpay', amountSatang: 6000 },
      { method: 'cash', amountSatang: 4000 },
    ])
    expect(result.changeSatang).toBe(0)
  })

  test('rejects underpayment', () => {
    expect(() => settlePayments(10000, [{ method: 'cash', amountSatang: 9999 }])).toThrow()
  })

  test('rejects change that cash cannot cover', () => {
    expect(() => settlePayments(10000, [{ method: 'card', amountSatang: 12000 }])).toThrow()
    expect(() =>
      settlePayments(10000, [
        { method: 'card', amountSatang: 11000 },
        { method: 'cash', amountSatang: 500 },
      ]),
    ).toThrow()
  })
})
