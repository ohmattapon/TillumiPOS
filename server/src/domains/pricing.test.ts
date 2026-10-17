import { describe, expect, test } from 'bun:test'
import { calculateTotals } from './pricing'

const price = (overrides: Partial<Parameters<typeof calculateTotals>[0]>) =>
  calculateTotals({ subtotalSatang: 10_000, discountSatang: 0, vatMode: 'inclusive', vatRateBp: 700, ...overrides })

describe('calculateTotals: inclusive', () => {
  test('extracts VAT from the total without changing it', () => {
    // 107.00 contains exactly 7.00 of VAT.
    expect(price({ subtotalSatang: 10_700 })).toEqual({ vatSatang: 700, totalSatang: 10_700 })
  })

  test('takes VAT from the discounted amount and rounds to the nearest satang', () => {
    expect(price({ subtotalSatang: 10_000, discountSatang: 100 })).toEqual({ vatSatang: 648, totalSatang: 9_900 })
  })

  test('a zero rate charges no VAT', () => {
    expect(price({ vatRateBp: 0 })).toEqual({ vatSatang: 0, totalSatang: 10_000 })
  })
})

describe('calculateTotals: exclusive', () => {
  test('adds VAT on top of the price', () => {
    expect(price({ vatMode: 'exclusive', subtotalSatang: 10_000 })).toEqual({ vatSatang: 700, totalSatang: 10_700 })
  })

  test('takes VAT from the discounted amount', () => {
    // (100.00 - 10.00) x 7% = 6.30
    expect(price({ vatMode: 'exclusive', discountSatang: 1_000 })).toEqual({ vatSatang: 630, totalSatang: 9_630 })
  })

  test('rounds half a satang up', () => {
    // 0.50 x 7% = 0.035 -> 4 satang after rounding 3.5
    expect(price({ vatMode: 'exclusive', subtotalSatang: 50 })).toEqual({ vatSatang: 4, totalSatang: 54 })
  })

  test('a zero rate adds nothing', () => {
    expect(price({ vatMode: 'exclusive', vatRateBp: 0 })).toEqual({ vatSatang: 0, totalSatang: 10_000 })
  })
})

describe('calculateTotals: none', () => {
  test('ignores the rate entirely', () => {
    expect(price({ vatMode: 'none', vatRateBp: 700 })).toEqual({ vatSatang: 0, totalSatang: 10_000 })
  })
})

describe('calculateTotals: edges', () => {
  test.each(['inclusive', 'exclusive', 'none'] as const)('a free sale owes nothing in %p mode', (vatMode) => {
    expect(price({ vatMode, discountSatang: 10_000 })).toEqual({ vatSatang: 0, totalSatang: 0 })
  })

  test('is deterministic: the same input always gives the same answer', () => {
    const input = { subtotalSatang: 99_999, discountSatang: 123, vatMode: 'exclusive' as const, vatRateBp: 700 }

    expect(calculateTotals(input)).toEqual(calculateTotals({ ...input }))
  })
})
