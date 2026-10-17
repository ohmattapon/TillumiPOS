import { describe, expect, test } from 'bun:test'
import { matchScan, type ScanCandidate } from './scan'

const pack = (overrides: Partial<ScanCandidate['packs'][number]> = {}): ScanCandidate['packs'][number] => ({
  id: 7, barcode: 'BOX6', size: 6, priceSatang: null, isActive: true, ...overrides,
})
const product = (overrides: Partial<ScanCandidate> = {}): ScanCandidate => ({
  barcode: '885000', sku: 'COLA-1', packs: [], ...overrides,
})
const found = (items: ScanCandidate[]) => ({ items, total: items.length })

describe('matchScan', () => {
  test("a product's own barcode sells the product", () => {
    const cola = product({ packs: [pack()] })
    expect(matchScan('885000', true, found([cola]))).toEqual({ kind: 'product', product: cola })
  })

  test('an active pack barcode sells the pack', () => {
    const box = pack()
    const cola = product({ packs: [box] })
    expect(matchScan('BOX6', true, found([cola]))).toEqual({ kind: 'pack', product: cola, pack: box })
  })

  test('a switched-off pack barcode is refused and never falls through to a loose piece', () => {
    const cola = product({ packs: [pack({ isActive: false })] })
    expect(matchScan('BOX6', true, found([cola]))).toEqual({ kind: 'inactivePack', barcode: 'BOX6' })
  })

  test('a SKU found by the exact lookup sells the product, ignoring case', () => {
    const cola = product()
    const other = product({ barcode: '1', sku: 'X' })
    expect(matchScan('cola-1', true, found([other, cola]))).toEqual({ kind: 'product', product: cola })
  })

  test('a single fuzzy hit sells that product', () => {
    const cola = product()
    expect(matchScan('cola', false, found([cola]))).toEqual({ kind: 'product', product: cola })
  })

  test('nothing matching, or several fuzzy hits, is no match', () => {
    expect(matchScan('nope', false, found([]))).toEqual({ kind: 'none' })
    expect(matchScan('co', false, found([product(), product({ barcode: '2', sku: 'COLA-2' })]))).toEqual({ kind: 'none' })
  })
})
