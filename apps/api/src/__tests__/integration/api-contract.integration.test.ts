import { beforeEach, describe, expect, test } from 'bun:test'
import { baseUrl, client, ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]

describe('versioning', () => {
  test('routes live under /api/v1; the unversioned path is gone', async () => {
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200)
    expect((await fetch(baseUrl.replace('/api/v1', '/api') + '/health')).status).toBe(404)
  })
})

describe('error responses are RFC 9457 problem details', () => {
  const expectProblem = async (response: Response, status: number, title: string, code: string, detail: string) => {
    expect(response.status).toBe(status)
    expect(response.headers.get('content-type')).toBe('application/problem+json; charset=utf-8')
    expect(await response.json()).toEqual({ type: 'about:blank', title, status, detail, code })
  }

  test('an unauthenticated request', async () => {
    await expectProblem(await fetch(`${baseUrl}/auth/me`), 401, 'Unauthorized', 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ')
  })

  test('an unknown route', async () => {
    await expectProblem(await fetch(`${baseUrl}/nope`), 404, 'Not Found', 'NOT_FOUND', 'ไม่พบเส้นทางที่เรียก')
  })

  test('a malformed body', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    })

    await expectProblem(response, 400, 'Bad Request', 'PARSE', 'รูปแบบข้อมูลไม่ถูกต้อง')
  })

  test('a business rule failure keeps its code and message', async () => {
    const tea = await seedProduct(owner, { name: 'Tea', stock: 1 })

    const result = await owner.api.sales.post({ items: [{ productId: tea.id, quantity: 2 }], payments: cash(2000) })

    expect(result.error?.value as unknown).toEqual({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'สินค้า "Tea" เหลือ 1 ชิ้น ไม่พอขาย',
      code: 'INSUFFICIENT_STOCK',
    })
  })

  test('a validation failure lists the offending fields and has no `message` field', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: '' }),
    })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toBe('application/problem+json; charset=utf-8')
    expect(body).toMatchObject({ type: 'about:blank', title: 'Unprocessable Content', status: 422, code: 'VALIDATION' })
    expect(Array.isArray(body.errors)).toBe(true)
    expect((body.errors as unknown[]).length).toBeGreaterThan(0)
    expect(body).not.toHaveProperty('message')
  })

  test('the typed client receives the problem as an object, not as text', async () => {
    const result = await client().auth.me.get()

    expect(typeof result.error?.value).toBe('object')
    expect(result.error?.value).toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
  })
})

describe('lists', () => {
  test('every list answers { items, total }', async () => {
    const product = await seedProduct(owner, { stock: 3 })
    ok(await owner.api.catalog.categories.post({ name: 'Drinks' }))
    ok(await owner.api.sales.post({ items: [{ productId: product.id, quantity: 1 }], payments: cash(1000) }))

    const lists: { items: unknown[]; total: number }[] = [
      ok(await owner.api.users.get()),
      ok(await owner.api.catalog.categories.get()),
      ok(await owner.api.catalog.products.get({ query: {} })),
      ok(await owner.api.inventory.movements.get({ query: {} })),
      ok(await owner.api.sales.get({ query: {} })),
    ]

    for (const body of lists) {
      expect(Object.keys(body).sort()).toEqual(['items', 'total'])
      expect(body.total).toBe(body.items.length)
      expect(body.total).toBeGreaterThan(0)
    }
  })

  test('total counts everything that matches, not just the page returned', async () => {
    for (const name of ['Apple', 'Banana', 'Cherry', 'Durian', 'Elderberry']) await seedProduct(owner, { name })

    const firstPage = ok(await owner.api.catalog.products.get({ query: { limit: 2 } }))
    const secondPage = ok(await owner.api.catalog.products.get({ query: { limit: 2, offset: 2 } }))
    const pastTheEnd = ok(await owner.api.catalog.products.get({ query: { limit: 2, offset: 10 } }))

    expect(firstPage).toMatchObject({ total: 5 })
    expect(firstPage.items.map((item) => item.name)).toEqual(['Apple', 'Banana'])
    expect(secondPage.items.map((item) => item.name)).toEqual(['Cherry', 'Durian'])
    expect(pastTheEnd).toEqual({ items: [], total: 5 })
  })

  test('total respects the filters of the query', async () => {
    await seedProduct(owner, { name: 'Green tea' })
    await seedProduct(owner, { name: 'Black tea' })
    await seedProduct(owner, { name: 'Coffee' })

    const teas = ok(await owner.api.catalog.products.get({ query: { q: 'tea', limit: 1 } }))

    expect(teas.total).toBe(2)
    expect(teas.items).toHaveLength(1)
  })

  test('sales can be paged with limit and offset, newest first', async () => {
    const product = await seedProduct(owner, { stock: 10 })
    const receipts: string[] = []
    for (let i = 0; i < 3; i++)
      receipts.push(
        ok(await owner.api.sales.post({ items: [{ productId: product.id, quantity: 1 }], payments: cash(1000) })).receiptNo,
      )

    const page = ok(await owner.api.sales.get({ query: { limit: 1, offset: 1 } }))

    expect(page.total).toBe(3)
    expect(page.items.map((sale) => sale.receiptNo)).toEqual([receipts[1]!])
  })

  test('stock movements can be paged with limit and offset, newest first', async () => {
    const product = await seedProduct(owner)
    for (const quantity of [1, 2, 3])
      ok(await owner.api.inventory.receive.post({ productId: product.id, quantity }))

    const page = ok(await owner.api.inventory.movements.get({ query: { productId: product.id, limit: 1, offset: 1 } }))

    expect(page.total).toBe(3)
    expect(page.items.map((movement) => movement.quantity)).toEqual([2])
  })

  test.each([[{ limit: 0 }], [{ limit: 1001 }], [{ offset: -1 }]])('a product query of %p is a validation error', async (query) => {
    expect((await owner.api.catalog.products.get({ query })).status).toBe(422)
  })
})
