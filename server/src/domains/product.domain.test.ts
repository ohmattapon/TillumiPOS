import { describe, expect, test } from 'bun:test'
import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { ProductEntity, type ProductEntityProps } from './product.domain'
import type { ProductPack } from './product-pack'

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
  packs: [],
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

    test('carries the values interpolated into the message, so a client can translate it', () => {
      const paramsOf = (run: () => void) => {
        try {
          run()
        } catch (error) {
          return (error as DomainConflictError).params
        }
      }

      expect(paramsOf(() => product({ isActive: false }).assertSellable(1))).toEqual({ name: 'น้ำดื่ม' })
      expect(paramsOf(() => product({ stockQty: 2 }).assertSellable(3))).toEqual({ name: 'น้ำดื่ม', available: 2 })
    })

    test('an inactive product is reported as inactive even when it is also out of stock', () => {
      expect(() => product({ isActive: false, stockQty: 0 }).assertSellable(1)).toThrow('ปิดการขายแล้ว')
    })

    test('a product that does not track stock sells in any quantity', () => {
      expect(() => product({ trackStock: false, stockQty: 0 }).assertSellable(999)).not.toThrow()
    })
  })

  describe('packs', () => {
    const pack = (overrides: Partial<ProductPack> = {}): ProductPack => ({
      id: 7,
      barcode: '8850000000099',
      size: 6,
      priceSatang: null,
      isActive: true,
      ...overrides,
    })
    const errorOf = (run: () => void) => {
      try {
        run()
      } catch (error) {
        return error as DomainError
      }
    }

    test('a product built without packs has none', () => {
      const { packs: _packs, ...withoutPacks } = valid

      expect(new ProductEntity(withoutPacks).packs).toEqual([])
    })

    test('rejects more than 10 packs', () => {
      const packs = Array.from({ length: 11 }, (_, i) => pack({ id: i + 1, barcode: `b${i}` }))
      const error = errorOf(() => product({ packs }))

      expect(error).toBeInstanceOf(DomainError)
      expect(error?.code).toBe('INVALID_PRODUCT')
    })

    test('rejects two packs with the same barcode', () => {
      const error = errorOf(() => product({ packs: [pack({ id: 1 }), pack({ id: 2 })] }))

      expect(error).toBeInstanceOf(DomainConflictError)
      expect(error?.code).toBe('BARCODE_TAKEN')
      expect(error?.params).toEqual({ barcode: '8850000000099' })
    })

    test('rejects a pack barcode equal to the product barcode', () => {
      const error = errorOf(() => product({ packs: [pack({ barcode: valid.barcode as string })] }))

      expect(error).toBeInstanceOf(DomainConflictError)
      expect(error?.code).toBe('BARCODE_TAKEN')
    })

    test('with returns a new entity with the packs and leaves the original unchanged', () => {
      const original = product()
      const changed = original.with({ packs: [pack()] })

      expect(changed.packs).toEqual([pack()])
      expect(original.packs).toEqual([])
      expect(changed.toSnapshot().packs).toEqual([pack()])
    })

    test('packForSale returns an active pack', () => {
      expect(product({ packs: [pack()] }).packForSale(7)).toEqual(pack())
    })

    test('packForSale refuses an unknown pack, saying which', () => {
      const error = errorOf(() => product().packForSale(99))

      expect(error?.code).toBe('PACK_NOT_FOUND')
      expect(error?.params).toEqual({ packId: 99 })
    })

    test('packForSale refuses an inactive pack', () => {
      const error = errorOf(() => product({ packs: [pack({ isActive: false })] }).packForSale(7))

      expect(error).toBeInstanceOf(DomainConflictError)
      expect(error?.code).toBe('PACK_INACTIVE')
      expect(error?.params).toEqual({ barcode: '8850000000099' })
    })

    test('packForSale refuses an inactive product', () => {
      const error = errorOf(() => product({ isActive: false, packs: [pack()] }).packForSale(7))

      expect(error?.code).toBe('PRODUCT_INACTIVE')
    })
  })
})
