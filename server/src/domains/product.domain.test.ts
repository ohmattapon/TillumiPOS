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
  productType: 'normal',
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

  describe('productType', () => {
    test.each(['normal', 'cafe'] as const)('accepts and snapshots %s explicitly', (productType) => {
      const classified = product({ productType })

      expect(classified.productType).toBe(productType)
      expect(classified.toSnapshot().productType).toBe(productType)
    })

    test.each(['coffee', 'CAFE', '', null, undefined, 1])('rejects invalid classification %s', (productType) => {
      const props = { ...valid, productType } as unknown as ProductEntityProps
      const attempt = () => new ProductEntity(props)

      expect(attempt).toThrow(DomainError)
      expect(attempt).toThrow(expect.objectContaining({ code: 'INVALID_PRODUCT' }))
    })

    test('does not infer classification from a cafe name, category or SKU', () => {
      const classified = product({ name: 'กาแฟลาเต้', sku: 'CAFE-001', categoryId: 99, productType: 'normal' })

      expect(classified.productType).toBe('normal')
    })
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
    test.each(['normal', 'cafe'] as const)('preserves %s when classification is unchanged or undefined', (productType) => {
      const original = product({ productType })

      expect(original.with({}).productType).toBe(productType)
      expect(original.with({ name: 'ชื่อใหม่', productType: undefined }).productType).toBe(productType)
    })

    test('changes only classification without mutating the original', () => {
      const original = product()
      const changed = original.with({ productType: 'cafe' })
      const expected: ProductEntityProps = { ...valid, productType: 'cafe' }

      expect(changed).not.toBe(original)
      expect(changed.toSnapshot()).toEqual(expected)
      expect(original.toSnapshot()).toEqual(valid)
      expect(changed.with({ productType: 'normal' }).toSnapshot()).toEqual(valid)
    })

    test('rejects invalid classification changes', () => {
      const changes = { productType: 'coffee' } as never

      expect(() => product().with(changes)).toThrow(DomainError)
    })

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
    const pack6 = { id: 7, barcode: '885000000006', size: 6, priceSatang: 8500, isActive: true }
    const pack24 = { id: 9, barcode: '885000000024', size: 24, priceSatang: null, isActive: true }

    test('defaults to no packs and snapshots them', () => {
      expect(product().packs).toEqual([])
      expect(product().toSnapshot().packs).toEqual([])
    })

    test('holds packs and snapshots copies', () => {
      const packed = product({ packs: [pack6, pack24] })

      expect(packed.packs).toEqual([pack6, pack24])
      expect(packed.toSnapshot().packs).toEqual([pack6, pack24])
      expect(packed.toSnapshot().packs).not.toBe(packed.packs)
    })

    test('rejects more than 10 packs', () => {
      const many = Array.from({ length: 11 }, (_, i) => ({ ...pack6, id: 0, barcode: `P${i}` }))

      expect(() => product({ packs: many })).toThrow(expect.objectContaining({ code: 'INVALID_PRODUCT' }))
    })

    test('rejects a pack that reuses the product barcode', () => {
      const attempt = () => product({ packs: [{ ...pack6, barcode: '8850000000011' }] })

      expect(attempt).toThrow(DomainConflictError)
      expect(attempt).toThrow(expect.objectContaining({ code: 'BARCODE_TAKEN' }))
    })

    test('rejects a pack that reuses another pack barcode', () => {
      const attempt = () => product({ packs: [pack6, { ...pack24, barcode: pack6.barcode }] })

      expect(attempt).toThrow(expect.objectContaining({ code: 'BARCODE_TAKEN' }))
    })

    test('rejects a duplicated stored pack id', () => {
      const attempt = () => product({ packs: [pack6, { ...pack24, id: pack6.id }] })

      expect(attempt).toThrow(expect.objectContaining({ code: 'INVALID_PRODUCT' }))
    })

    test('rejects an invalid pack through the pack rules', () => {
      expect(() => product({ packs: [{ ...pack6, size: 1 }] })).toThrow(
        expect.objectContaining({ code: 'INVALID_PRODUCT' }),
      )
    })

    test('with() keeps packs unless they are replaced', () => {
      const packed = product({ packs: [pack6] })

      expect(packed.with({ name: 'ชื่อใหม่' }).packs).toEqual([pack6])
      expect(packed.with({ packs: [] }).packs).toEqual([])
    })

    test('findPack returns the pack or undefined', () => {
      const packed = product({ packs: [pack6] })

      expect(packed.findPack(7)).toEqual(pack6)
      expect(packed.findPack(999)).toBeUndefined()
    })

    test('packForSale refuses an inactive product, a missing pack and an inactive pack', () => {
      const packed = product({ packs: [pack6, { ...pack24, isActive: false }] })

      expect(packed.packForSale(7)).toEqual(pack6)
      expect(() => product({ isActive: false, packs: [pack6] }).packForSale(7)).toThrow(
        expect.objectContaining({ code: 'PRODUCT_INACTIVE' }),
      )
      expect(() => packed.packForSale(999)).toThrow(expect.objectContaining({ code: 'PACK_NOT_FOUND' }))
      expect(() => packed.packForSale(9)).toThrow(expect.objectContaining({ code: 'PACK_INACTIVE' }))
    })
  })
})
