import { describe, expect, test } from 'bun:test'
import { makeProduct } from '../__tests__/factories'
import { SaleEntity, type SalePromotion } from './sale.domain'

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

const promotion: SalePromotion = {
  id: 4, name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: null, discountSatang: 1000,
}
const base = {
  lines: [{ product: makeProduct({ priceSatang: 10000 }), quantity: 1 }],
  payments: [{ method: 'cash' as const, amountSatang: 10000 }],
  vatMode: 'inclusive' as const,
  vatRateBp: 700,
  branchId: 1,
  cashier: { id: 1, displayName: 'แคชเชียร์' },
}
const stored = (sale: ReturnType<typeof SaleEntity.complete>) =>
  new SaleEntity({
    ...sale, id: 1, receiptNo: 'MAIN-20261015-00001', status: 'completed',
    voidedById: null, voidedAt: null, voidReason: null, createdAt: new Date('2026-10-15T05:00:00Z'),
  })

describe('sale promotion snapshot', () => {
  test('keeps the promotion beside the discount it gave', () => {
    const sale = stored(SaleEntity.complete({ ...base, discountSatang: 1000, promotion }))
    expect(sale.promotion).toEqual(promotion)
    expect(sale.discountSatang).toBe(1000)
    expect(sale.totalSatang).toBe(9000)
  })

  test('a sale without a promotion has null, and so does one restored from an older snapshot', () => {
    const sale = stored(SaleEntity.complete({ ...base, discountSatang: 0 }))
    expect(sale.promotion).toBeNull()
    const { promotion: _dropped, ...legacy } = sale.toSnapshot()
    expect(new SaleEntity(legacy).promotion).toBeNull()
  })

  test('the discount has to be the one the promotion gave', () => {
    expect(codeOf(() => SaleEntity.complete({ ...base, discountSatang: 500, promotion }))).toBe('INVALID_DISCOUNT')
  })

  test('the snapshot used to replay an idempotent request carries the promotion', () => {
    const sale = stored(SaleEntity.complete({ ...base, discountSatang: 1000, promotion }))
    expect(sale.toSnapshot().promotion).toEqual(promotion)
    expect(new SaleEntity(sale.toSnapshot()).promotion).toEqual(promotion)
  })
})
