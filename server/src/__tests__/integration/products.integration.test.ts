import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'
import { client as sqlClient } from '../../libs/db'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const search = async (q: string) => ok(await owner.api.catalog.products.get({ query: { q } })).items.map((item) => item.name)

describe('products', () => {
  test('automatic SKUs skip existing codes, including inactive lowercase codes', async () => {
    await sqlClient`select setval('product_sku_number_seq', 1, false)`
    const existing = await seedProduct(owner, { sku: 'sku-000001' })
    ok(await owner.api.catalog.products({ id: existing.id }).patch({ isActive: false }))
    const created = ok(await owner.api.catalog.products.post({ name: 'Automatic', priceSatang: 100 }))
    expect(created.sku).toBe('SKU-000002')
    const renamed = ok(await owner.api.catalog.products({ id: created.id }).patch({ name: 'Renamed' }))
    expect(renamed.sku).toBe(created.sku)
    expect((await owner.api.catalog.products({ id: created.id }).patch({ sku: '' })).status).toBe(422)
  })

  test('parallel creations receive distinct SKUs and preserve manual codes', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      owner.api.catalog.products.post({ name: `Parallel ${i}`, priceSatang: 100 })))
    const codes = results.map((result) => ok(result).sku)
    expect(new Set(codes).size).toBe(8)
    expect(codes.every((sku) => /^SKU-\d{6,}$/.test(sku))).toBe(true)
    expect(ok(await owner.api.catalog.products.post({ sku: 'MANUAL', name: 'Manual', priceSatang: 100 })).sku).toBe('MANUAL')
  })

  test('classification can be created, changed alone and preserved when omitted without changing stock or price', async () => {
    const input = { sku: 'CAFE-CUSTOM', name: 'Custom drink', priceSatang: 4900, productType: 'cafe' as const }
    const created = ok(await owner.api.catalog.products.post(input))
    expect(created.productType).toBe('cafe')
    const renamed = ok(await owner.api.catalog.products({ id: created.id }).patch({ name: 'Renamed drink' }))
    expect(renamed.productType).toBe('cafe')
    const reclassified = ok(await owner.api.catalog.products({ id: created.id }).patch({ productType: 'normal' }))
    expect(reclassified).toEqual({ ...renamed, productType: 'normal' })
    expect(ok(await owner.api.catalog.products({ id: created.id }).get())).toEqual(reclassified)
  })

  test('unfiltered lists and scanner lookup keep both types', async () => {
    const normal = await seedProduct(owner, { name: 'A normal', barcode: '111', stock: 2 })
    const cafe = await seedProduct(owner, { name: 'B cafe', barcode: '222', productType: 'cafe', stock: 3 })
    const all = ok(await owner.api.catalog.products.get({ query: {} }))
    expect(all.items).toEqual([normal, cafe])
    expect(all.total).toBe(2)
    const lowStock = ok(await owner.api.catalog.products.get({ query: { stockAtMost: 3 } }))
    expect(lowStock.items.map(item => item.productType)).toEqual(['normal', 'cafe'])
    for (const product of [normal, cafe]) {
      const result = ok(await owner.api.catalog.products.get({ query: { code: product.barcode! } }))
      expect(result).toEqual({ items: [product], total: 1 })
    }
  })

  test('type filtering combines with category, search, active status, stock and pagination before total', async () => {
    const category = ok(await owner.api.catalog.categories.post({ name: 'Drinks' }))
    await seedProduct(owner, { name: 'A tea normal', categoryId: category.id, stock: 1 })
    const first = await seedProduct(owner, { name: 'B tea cafe', categoryId: category.id, productType: 'cafe', stock: 1 })
    const second = await seedProduct(owner, { name: 'C tea cafe', categoryId: category.id, productType: 'cafe', stock: 2 })
    const inactive = await seedProduct(owner, { name: 'D tea cafe', categoryId: category.id, productType: 'cafe', stock: 1 })
    ok(await owner.api.catalog.products({ id: inactive.id }).patch({ isActive: false }))
    await seedProduct(owner, { name: 'E coffee cafe', categoryId: category.id, productType: 'cafe', stock: 1 })
    await seedProduct(owner, { name: 'F tea cafe', productType: 'cafe', stock: 1 })
    await seedProduct(owner, { name: 'G tea cafe', categoryId: category.id, productType: 'cafe', stock: 9 })
    const query = { productType: 'cafe' as const, categoryId: category.id, q: 'tea', stockAtMost: 2, limit: 1 }
    expect(ok(await owner.api.catalog.products.get({ query }))).toEqual({ items: [first], total: 2 })
    const nextQuery = { ...query, offset: 1 }
    expect(ok(await owner.api.catalog.products.get({ query: nextQuery }))).toEqual({ items: [second], total: 2 })
    const pastQuery = { ...query, offset: 2 }
    expect(ok(await owner.api.catalog.products.get({ query: pastQuery }))).toEqual({ items: [], total: 2 })
    const inactiveQuery = { ...query, isActive: false }
    const hidden = ok(await owner.api.catalog.products.get({ query: inactiveQuery }))
    expect(hidden).toEqual({ items: [{ ...inactive, isActive: false }], total: 1 })
    const normalQuery = { productType: 'normal' as const }
    expect(ok(await owner.api.catalog.products.get({ query: normalQuery })).total).toBe(1)
  })

  test('invalid HTTP product types are rejected on create, update and list', async () => {
    const product = await seedProduct(owner)
    const invalidCreate = { sku: 'INVALID', name: 'Invalid', priceSatang: 100, productType: 'other' }
    const invalidUpdate = { productType: 'other' }
    const invalidQuery = { productType: 'other' }
    expect((await owner.api.catalog.products.post(invalidCreate as never)).status).toBe(422)
    expect((await owner.api.catalog.products({ id: product.id }).patch(invalidUpdate as never)).status).toBe(422)
    expect((await owner.api.catalog.products.get({ query: invalidQuery as never })).status).toBe(422)
    expect(ok(await owner.api.catalog.products({ id: product.id }).get())).toEqual(product)
  })

  test('a created product is found by name, SKU and barcode', async () => {
    const created = ok(
      await owner.api.catalog.products.post({
        sku: 'DRK-001',
        barcode: '8850000000011',
        name: 'น้ำดื่ม 600 มล.',
        priceSatang: 1000,
      }),
    )
    await seedProduct(owner, { name: 'Something else' })

    expect(created).toMatchObject({ stockQty: 0, isActive: true, trackStock: true, imageUrl: null })
    expect(await search('น้ำดื่ม')).toEqual(['น้ำดื่ม 600 มล.'])
    expect(await search('drk-001')).toEqual(['น้ำดื่ม 600 มล.'])
    expect(await search('8850000000011')).toEqual(['น้ำดื่ม 600 มล.'])
  })

  test('duplicate SKU or barcode is a conflict', async () => {
    await seedProduct(owner, { sku: 'DUP-1', barcode: '111' })

    const sameSku = await owner.api.catalog.products.post({ sku: 'DUP-1', name: 'Other', priceSatang: 100 })
    const sameBarcode = await owner.api.catalog.products.post({
      sku: 'DUP-2',
      barcode: '111',
      name: 'Other',
      priceSatang: 100,
    })

    expect(sameSku.status).toBe(409)
    expect(sameSku.error?.value).toMatchObject({ code: 'DUPLICATE' })
    expect(sameBarcode.status).toBe(409)
  })

  test('inactive products are hidden unless explicitly requested', async () => {
    const active = await seedProduct(owner, { name: 'Active' })
    const retired = await seedProduct(owner, { name: 'Retired' })
    ok(await owner.api.catalog.products({ id: retired.id }).patch({ isActive: false }))

    const visible = ok(await owner.api.catalog.products.get({ query: {} })).items
    const all = ok(await owner.api.catalog.products.get({ query: { includeInactive: true } })).items

    expect(visible.map((item) => item.id)).toEqual([active.id])
    expect(all.map((item) => item.name)).toEqual(['Active', 'Retired'])
  })

  test('% and _ in a search term are matched literally', async () => {
    await seedProduct(owner, { name: '100% juice' })
    await seedProduct(owner, { name: '100 percent juice' })
    await seedProduct(owner, { name: 'a_b snack' })
    await seedProduct(owner, { name: 'axb snack' })

    expect(await search('100%')).toEqual(['100% juice'])
    expect(await search('a_b')).toEqual(['a_b snack'])
  })

  test('an unknown stock field is ignored and cannot mutate stock', async () => {
    const product = await seedProduct(owner, { stock: 5 })

    const result = await owner.api.catalog.products({ id: product.id }).patch({
      name: 'Renamed',
      stockQty: 999,
    } as never)

    expect(result.status).toBe(200)
    expect(ok(result).stockQty).toBe(5)
    expect(ok(await owner.api.catalog.products({ id: product.id }).get()).stockQty).toBe(5)
  })

  test('a product cannot point at a category that does not exist', async () => {
    const result = await owner.api.catalog.products.post({ sku: 'NEW-1', name: 'New', priceSatang: 100, categoryId: 9999 })

    expect(result.status).toBe(409)
    expect(result.error?.value).toMatchObject({
      code: 'IN_USE',
      detail: 'ข้อมูลนี้ถูกอ้างอิงอยู่ หรืออ้างถึงข้อมูลที่ไม่มีอยู่',
    })
  })

  test('barcode and category can be cleared with null', async () => {
    const category = ok(await owner.api.catalog.categories.post({ name: 'Drinks' }))
    const product = await seedProduct(owner, { barcode: '123', categoryId: category.id })

    const cleared = ok(await owner.api.catalog.products({ id: product.id }).patch({ barcode: null, categoryId: null }))

    expect(cleared).toMatchObject({ barcode: null, categoryId: null, name: product.name })
  })

  test('an unknown product is not found', async () => {
    const read = await owner.api.catalog.products({ id: 9999 }).get()
    const updated = await owner.api.catalog.products({ id: 9999 }).patch({ name: 'Ghost' })

    expect(read.status).toBe(404)
    expect(read.error?.value).toMatchObject({ code: 'NOT_FOUND', detail: 'ไม่พบสินค้า' })
    expect(updated.status).toBe(404)
  })

  test('a created product returns exactly the public fields', async () => {
    const created = ok(await owner.api.catalog.products.post({ sku: 'NEW-1', name: 'New', priceSatang: 100 }))

    expect(created).toEqual({
      id: expect.any(Number),
      sku: 'NEW-1',
      barcode: null,
      name: 'New',
      categoryId: null,
      productType: 'normal',
      priceSatang: 100,
      costSatang: 0,
      trackStock: true,
      stockQty: 0,
      isActive: true,
      imageUrl: null,
    })
  })

  test('an update with no fields returns the product unchanged', async () => {
    const product = await seedProduct(owner, { stock: 5 })

    const unchanged = ok(await owner.api.catalog.products({ id: product.id }).patch({}))

    expect(unchanged).toEqual(product)
  })
})
