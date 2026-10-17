import { describe, expect, test } from 'bun:test'
import { ShiftCashEntryEntity } from './shift-cash-entry.domain'

const entry = (kind: 'cash_sale' | 'cash_in' | 'cash_out' | 'cash_refund', overrides: Record<string, unknown> = {}) =>
  new ShiftCashEntryEntity({
    id: 1,
    shiftId: 2,
    kind,
    amountSatang: 500,
    saleId: null,
    actorId: 3,
    actorName: 'สมชาย',
    reason: null,
    createdAt: new Date('2026-10-13T02:00:00Z'),
    ...overrides,
  } as ConstructorParameters<typeof ShiftCashEntryEntity>[0])

describe('ShiftCashEntryEntity', () => {
  test('uses net drawer deltas and excludes non-cash tender upstream', () => {
    expect(entry('cash_sale').signedDeltaSatang).toBe(500)
    expect(entry('cash_in', { reason: 'เติมเงินทอน' }).signedDeltaSatang).toBe(500)
    expect(entry('cash_out', { reason: 'นำเงินไปฝาก' }).signedDeltaSatang).toBe(-500)
    expect(entry('cash_refund', { saleId: 10 }).signedDeltaSatang).toBe(-500)
  })

  test('requires a reason for manual cash movements and a sale for a refund', () => {
    expect(() => entry('cash_in')).toThrow('เหตุผล')
    expect(() => entry('cash_out', { reason: ' ' })).toThrow('เหตุผล')
    expect(() => entry('cash_refund')).toThrow('อ้างอิงบิล')
  })

  test('rejects invalid or excessive cash amounts', () => {
    expect(() => entry('cash_sale', { amountSatang: 0 })).toThrow('ยอดเงิน')
    expect(() => entry('cash_sale', { amountSatang: 2_147_483_648 })).toThrow('ยอดเงิน')
  })
})
