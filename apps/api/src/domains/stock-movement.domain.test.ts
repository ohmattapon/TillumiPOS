import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import { assertRecordable, StockMovementEntity, type StockMovementEntityProps } from './stock-movement.domain'

const valid: StockMovementEntityProps = {
  id: 1,
  productId: 2,
  type: 'sale',
  quantity: -3,
  balanceAfter: 7,
  reference: '20261013-00001',
  note: null,
  userId: 4,
  createdAt: new Date('2026-10-13T06:00:00Z'),
}

describe('StockMovementEntity', () => {
  test('holds its properties', () => {
    expect(new StockMovementEntity(valid).toSnapshot()).toEqual(valid)
  })

  test.each([0, 1.5, Number.NaN])('rejects a quantity of %p', (quantity) => {
    expect(() => new StockMovementEntity({ ...valid, quantity })).toThrow(DomainError)
  })

  test('accepts movements in both directions', () => {
    expect(new StockMovementEntity({ ...valid, quantity: 5 }).quantity).toBe(5)
    expect(new StockMovementEntity({ ...valid, quantity: -5 }).quantity).toBe(-5)
  })

  test('rejects an unknown type and a fractional balance', () => {
    expect(() => new StockMovementEntity({ ...valid, type: 'theft' as never })).toThrow(DomainError)
    expect(() => new StockMovementEntity({ ...valid, balanceAfter: 0.5 })).toThrow(DomainError)
  })

  test('a negative balance is representable, so the ledger can show an oversold product', () => {
    expect(new StockMovementEntity({ ...valid, balanceAfter: -1 }).balanceAfter).toBe(-1)
  })
})

describe('assertRecordable', () => {
  test('accepts a well-formed movement and rejects a zero quantity', () => {
    expect(() => assertRecordable({ productId: 1, type: 'receive', quantity: 10, userId: 1 })).not.toThrow()
    expect(() => assertRecordable({ productId: 1, type: 'receive', quantity: 0, userId: 1 })).toThrow(DomainError)
  })
})
