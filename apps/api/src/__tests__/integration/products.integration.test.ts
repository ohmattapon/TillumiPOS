import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const search = async (q: string) => ok(await owner.api.catalog.products.get({ query: { q } })).map((item) => item.name)

describe('products', () => {
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

    const visible = ok(await owner.api.catalog.products.get({ query: {} }))
    const all = ok(await owner.api.catalog.products.get({ query: { includeInactive: true } }))

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
})
