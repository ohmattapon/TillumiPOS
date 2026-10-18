import { describe, expect, it } from 'bun:test'
import { receiptQuantity } from './quantity'

describe('receipt quantity editing', () => {
  it('keeps empty intermediate input invalid instead of interpreting it as a saved quantity', () => {
    expect(receiptQuantity('')).toBeNull()
    expect(receiptQuantity(' ')).toBeNull()
  })
  it('only accepts positive whole stock quantities within the database limit', () => {
    expect(receiptQuantity('12')).toBe(12)
    expect(receiptQuantity('2147483647')).toBe(2147483647)
    for (const value of ['0', '-1', '1.5', '2147483648', '1e3', 'abc']) expect(receiptQuantity(value)).toBeNull()
  })
})
