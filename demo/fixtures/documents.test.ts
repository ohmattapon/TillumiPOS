import { describe, expect, test } from 'bun:test'
import { calculateTotals } from '@pos/api/pricing'
import { modifierGroups, products } from './catalog'
import { members, promotions, settings } from './shop'
import { buildOrder, buildQuote, buildSale, priceLine, summarizeSales, type CatalogDeps } from './documents'

const deps: CatalogDeps = { products, groups: modifierGroups, promotions, members, settings }

describe('priceLine', () => {
  test('adds option prices to the unit price', () => {
    // ลาเต้เย็น 60.00 + แก้วกลาง 10.00 + วิปครีม 15.00, two cups.
    const priced = priceLine(deps, { productId: 8, quantity: 2, options: [2, 10, 5] })
    expect(priced.unitPriceSatang).toBe(6000 + 1000 + 1500)
    expect(priced.lineTotalSatang).toBe(8500 * 2)
    expect(priced.options.map((o) => o.optionId)).toEqual([2, 10, 5])
  })

  test('drops unknown option ids', () => {
    const priced = priceLine(deps, { productId: 8, quantity: 1, options: [9999] })
    expect(priced.unitPriceSatang).toBe(6000)
    expect(priced.options).toEqual([])
  })
})

describe('buildSale', () => {
  test('totals, VAT and change add up', () => {
    const sale = buildSale(deps, {
      id: 101,
      receiptNo: 'MAIN-000101',
      items: [{ productId: 8, quantity: 2, options: [2, 10] }],
      discountSatang: 0,
      payments: [{ method: 'cash', amountSatang: 20000 }],
      createdAt: new Date('2026-03-02T10:00:00+07:00'),
    })
    // 2 × (60 + 10) = 140.00; the 10%-off promotion (min 100) beats the zero typed discount.
    expect(sale.subtotalSatang).toBe(14000)
    expect(sale.discountSatang).toBe(1400)
    expect(sale.promotion?.id).toBe(1)
    const expected = calculateTotals({ subtotalSatang: 14000, discountSatang: 1400, vatMode: 'inclusive', vatRateBp: 700 })
    expect(sale.totalSatang).toBe(expected.totalSatang)
    expect(sale.vatSatang).toBe(expected.vatSatang)
    expect(sale.paidSatang).toBe(20000)
    expect(sale.changeSatang).toBe(20000 - expected.totalSatang)
    expect(sale.status).toBe('completed')
  })

  test('a typed discount bigger than the promotion wins and clears the promotion', () => {
    const sale = buildSale(deps, {
      id: 102,
      receiptNo: 'MAIN-000102',
      items: [{ productId: 8, quantity: 2, options: [2, 10] }],
      discountSatang: 5000,
      payments: [{ method: 'cash', amountSatang: 20000 }],
      createdAt: new Date('2026-03-02T10:00:00+07:00'),
    })
    expect(sale.discountSatang).toBe(5000)
    expect(sale.promotion).toBeNull()
  })

  test('a pinned quote is sold at its own totals', () => {
    const quote = buildQuote(deps, {
      id: 7,
      lines: [{ productId: 19, quantity: 2, options: [3, 11] }],
      createdAt: new Date('2026-03-02T10:00:00+07:00'),
    })
    const sale = buildSale(deps, {
      id: 103,
      receiptNo: 'MAIN-000103',
      items: [],
      discountSatang: 999,
      payments: [{ method: 'cash', amountSatang: quote.totalSatang }],
      quote,
      createdAt: new Date('2026-03-02T10:05:00+07:00'),
    })
    expect(sale.totalSatang).toBe(quote.totalSatang)
    expect(sale.discountSatang).toBe(quote.discountSatang)
    expect(sale.items).toHaveLength(1)
  })
})

describe('buildOrder', () => {
  test('snapshots prices and sums the subtotal', () => {
    const { order, nextLineId } = buildOrder(
      deps,
      {
        id: 9,
        label: null,
        tableId: 1,
        lines: [{ productId: 31, quantity: 2 }, { productId: 2, quantity: 1, options: [3, 9], note: 'แยกน้ำแข็ง' }],
        createdAt: new Date('2026-03-02T10:00:00+07:00'),
      },
      1,
    )
    expect(order.items.map((i) => i.lineId)).toEqual([1, 2])
    expect(nextLineId).toBe(3)
    expect(order.subtotalSatang).toBe(5500 * 2 + 5000)
    expect(order.items[1].note).toBe('แยกน้ำแข็ง')
    expect(order.itemCount).toBe(3)
  })
})

describe('summarizeSales', () => {
  test('counts completed bills only and nets cash of change', () => {
    const live = buildSale(deps, {
      id: 104, receiptNo: 'MAIN-000104',
      items: [{ productId: 24, quantity: 4 }],
      discountSatang: 0,
      payments: [{ method: 'cash', amountSatang: 10000 }],
      createdAt: new Date('2026-03-02T11:00:00+07:00'),
    })
    const dead: typeof live = { ...live, id: 105, receiptNo: 'MAIN-000105', status: 'voided', voidedAt: new Date(), voidReason: 'x' }
    const summary = summarizeSales([live, dead])
    expect(summary.saleCount).toBe(1)
    expect(summary.totalSatang).toBe(live.totalSatang)
    expect(summary.byMethod.find((r) => r.method === 'cash')?.amountSatang).toBe(10000 - live.changeSatang)
  })
})
