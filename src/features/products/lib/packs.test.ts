import { describe, expect, test } from 'bun:test'
import { toPackInput, toPackRows } from './packs'

const parseAmount = (input: string) => {
  const value = Number(input)
  return input.trim() !== '' && Number.isFinite(value) ? Math.round(value * 100) : null
}

describe('toPackInput', () => {
  test('drops a row with no barcode and no size', () => {
    expect(toPackInput([{ barcode: ' ', size: '', price: '', isActive: true }], parseAmount)).toEqual({ packs: [] })
  })

  test('trims the barcode and turns an empty price into null', () => {
    const rows = [{ barcode: ' 885 ', size: '6', price: '', isActive: true }]
    expect(toPackInput(rows, parseAmount)).toEqual({
      packs: [{ barcode: '885', size: 6, priceSatang: null, isActive: true }],
    })
  })

  test('keeps the id and a parsed price', () => {
    const rows = [{ id: 4, barcode: '1', size: '12', price: '99', isActive: false }]
    expect(toPackInput(rows, parseAmount)).toEqual({
      packs: [{ id: 4, barcode: '1', size: 12, priceSatang: 9900, isActive: false }],
    })
  })

  test('reports an unparsable size with its row index', () => {
    expect(toPackInput([{ barcode: '1', size: 'abc', price: '', isActive: true }], parseAmount)).toEqual({ error: 'size', index: 0 })
    expect(toPackInput([{ barcode: '1', size: '2.5', price: '', isActive: true }], parseAmount)).toEqual({ error: 'size', index: 0 })
  })

  test('reports an unparsable price with its row index', () => {
    const rows = [
      { barcode: '1', size: '6', price: '', isActive: true },
      { barcode: '2', size: '12', price: 'x', isActive: true },
    ]
    expect(toPackInput(rows, parseAmount)).toEqual({ error: 'price', index: 1 })
  })
})

describe('toPackRows', () => {
  test('maps a null price to an empty string and formats a set price', () => {
    const rows = toPackRows(
      [
        { id: 1, barcode: '885', size: 6, priceSatang: null, isActive: true },
        { id: 2, barcode: '886', size: 12, priceSatang: 9900, isActive: false },
      ],
      (satang) => String(satang / 100),
    )
    expect(rows).toEqual([
      { id: 1, barcode: '885', size: '6', price: '', isActive: true },
      { id: 2, barcode: '886', size: '12', price: '99', isActive: false },
    ])
  })
})
