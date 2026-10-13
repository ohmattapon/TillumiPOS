import { describe, expect, test } from 'bun:test'
import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { ProductEntity, type ProductEntityProps } from './product.domain'

const valid: ProductEntityProps = {
  id: 1,
  sku: 'DRK-001',
  barcode: '8850000000011',
  name: 'น้ำดื่ม',
  categoryId: 2,
  priceSatang: 1000,
  costSatang: 600,
  trackStock: true,
  stockQty: 5,
  isActive: true,
  imageKey: 'products/1/a.webp',
}
const product = (overrides: Partial<ProductEntityProps> = {}) => new ProductEntity({ ...valid, ...overrides })

describe('ProductEntity', () => {
  test('holds its properties', () => {
    expect(product().toSnapshot()).toEqual(valid)
  })

  test.each<[string, Partial<ProductEntityProps>]>([
    ['an empty SKU', { sku: '' }],
    ['a SKU over 64 characters', { sku: 'x'.repeat(65) }],
    ['an empty barcode', { barcode: '' }],
    ['a barcode over 64 characters', { barcode: 'x'.repeat(65) }],
    ['an empty name', { name: '' }],
    ['a name over 200 characters', { name: 'x'.repeat(201) }],
    ['a negative price', { priceSatang: -1 }],
    ['a fractional price', { priceSatang: 10.5 }],
    ['a negative cost', { costSatang: -1 }],
    ['a fractional stock quantity', { stockQty: 1.5 }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => product(overrides)).toThrow(DomainError)
  })

  test('accepts no barcode, no category, a zero price and negative stock', () => {
    const edge = product({ barcode: null, categoryId: null, priceSatang: 0, costSatang: 0, stockQty: -2 })

    expect(edge.toSnapshot()).toMatchObject({ barcode: null, categoryId: null, priceSatang: 0, stockQty: -2 })
  })

  describe('with', () => {
    test('changes the given fields and keeps the rest', () => {
      const changed = product().with({ name: 'น้ำแร่', priceSatang: 1500 })

      expect(changed.toSnapshot()).toEqual({ ...valid, name: 'น้ำแร่', priceSatang: 1500 })
    })

    test('undefined keeps a value, null clears barcode and category', () => {
      const changed = product().with({ name: undefined, barcode: null, categoryId: null })

      expect(changed.toSnapshot()).toEqual({ ...valid, barcode: null, categoryId: null })
    })

    test('never changes id, stock or image, whatever is passed in', () => {
      const changed = product().with({ id: 99, stockQty: 999, imageKey: 'other' } as never)

      expect(changed.toSnapshot()).toEqual(valid)
    })

    test('enforces the same rules as the constructor', () => {
      expect(() => product().with({ priceSatang: -1 })).toThrow(DomainError)
    })
  })

  describe('assertSellable', () => {
    test('passes when active and in stock, including selling the last unit', () => {
      expect(() => product({ stockQty: 5 }).assertSellable(5)).not.toThrow()
    })

    test('refuses an inactive product', () => {
      const attempt = () => product({ isActive: false }).assertSellable(1)

      expect(attempt).toThrow(DomainConflictError)
      expect(attempt).toThrow('สินค้า "น้ำดื่ม" ปิดการขายแล้ว')
    })

    test('refuses more than is in stock, saying how many are left', () => {
      const attempt = () => product({ stockQty: 2 }).assertSellable(3)

      expect(attempt).toThrow(DomainConflictError)
      expect(attempt).toThrow('สินค้า "น้ำดื่ม" เหลือ 2 ชิ้น ไม่พอขาย')
    })

    test('carries the codes clients switch on', () => {
      const codeOf = (run: () => void) => {
        try {
          run()
        } catch (error) {
          return (error as DomainConflictError).code
        }
      }

      expect(codeOf(() => product({ isActive: false }).assertSellable(1))).toBe('PRODUCT_INACTIVE')
      expect(codeOf(() => product({ stockQty: 0 }).assertSellable(1))).toBe('INSUFFICIENT_STOCK')
    })

    test('an inactive product is reported as inactive even when it is also out of stock', () => {
      expect(() => product({ isActive: false, stockQty: 0 }).assertSellable(1)).toThrow('ปิดการขายแล้ว')
    })

    test('a product that does not track stock sells in any quantity', () => {
      expect(() => product({ trackStock: false, stockQty: 0 }).assertSellable(999)).not.toThrow()
    })
  })
})
