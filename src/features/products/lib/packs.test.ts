import { describe, expect, test } from 'bun:test'
import { MAX_PACKS, toPackInput, toPackRows, type PackRow } from './packs'

const baht = { parse: (input: string) => (/^\d+(\.\d{1,2})?$/.test(input.trim()) ? Math.round(Number(input) * 100) : null) }
const toBaht = (satang: number) => (satang / 100).toFixed(2)

function row(overrides: Partial<PackRow> = {}): PackRow {
  return { barcode: 'CASE-1', size: '12', price: '270.00', isActive: true, ...overrides }
}

describe('toPackRows', () => {
  test('shows a pack price, and leaves a pack that follows the piece price blank', () => {
    const rows = toPackRows(
      [
        { id: 5, barcode: 'CASE-1', size: 12, priceSatang: 27_000, isActive: true },
        { id: 6, barcode: 'CASE-2', size: 6, priceSatang: null, isActive: false },
      ],
      toBaht,
    )
    expect(rows).toEqual([
      { id: 5, barcode: 'CASE-1', size: '12', price: '270.00', isActive: true },
      { id: 6, barcode: 'CASE-2', size: '6', price: '', isActive: false },
    ])
  })
})

describe('toPackInput', () => {
  test('turns the typed rows into what the API takes, keeping the id of a stored pack', () => {
    const result = toPackInput([row({ id: 5 }), row({ barcode: 'CASE-2', size: '6', price: '' })], baht.parse)
    expect(result).toEqual({
      packs: [
        { id: 5, barcode: 'CASE-1', size: 12, priceSatang: 27_000, isActive: true },
        { barcode: 'CASE-2', size: 6, priceSatang: null, isActive: true },
      ],
    })
  })

  test('drops a row the owner left empty', () => {
    expect(toPackInput([row({ barcode: '  ', size: '  ' })], baht.parse)).toEqual({ packs: [] })
  })

  test('refuses a size that is not a whole number of pieces', () => {
    expect(toPackInput([row({ size: '12.5' })], baht.parse)).toEqual({ error: 'size', index: 0 })
  })

  test('refuses a price it cannot read, naming the row', () => {
    expect(toPackInput([row(), row({ barcode: 'CASE-2', price: 'abc' })], baht.parse)).toEqual({
      error: 'price',
      index: 1,
    })
  })

  test('caps a product at the number of packs the API accepts', () => {
    expect(MAX_PACKS).toBe(10)
  })
})
