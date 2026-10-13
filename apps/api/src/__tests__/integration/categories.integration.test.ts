import { beforeEach, describe, expect, test } from 'bun:test'
import { client, ok, resetDatabase, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

describe('categories', () => {
  test('a created category gets defaults and exactly the public fields', async () => {
    const created = ok(await owner.api.catalog.categories.post({ name: 'เครื่องดื่ม' }))

    expect(created).toEqual({ id: expect.any(Number), name: 'เครื่องดื่ม', sortOrder: 0, isActive: true })
  })

  test('the list is ordered by sort order, then name, and includes inactive categories', async () => {
    const snacks = ok(await owner.api.catalog.categories.post({ name: 'Snacks', sortOrder: 2 }))
    ok(await owner.api.catalog.categories.post({ name: 'Drinks', sortOrder: 1 }))
    ok(await owner.api.catalog.categories.post({ name: 'Bakery', sortOrder: 2 }))
    ok(await owner.api.catalog.categories({ id: snacks.id }).patch({ isActive: false }))

    const listed = ok(await owner.api.catalog.categories.get())

    expect(listed.map((category) => [category.name, category.isActive])).toEqual([
      ['Drinks', true],
      ['Bakery', true],
      ['Snacks', false],
    ])
  })

  test('any signed-in user can list, anonymous users cannot', async () => {
    const cashier = await signIn('cashier')

    expect((await cashier.api.catalog.categories.get()).status).toBe(200)
    expect((await client().catalog.categories.get()).status).toBe(401)
  })

  test('a partial update changes only the given fields', async () => {
    const created = ok(await owner.api.catalog.categories.post({ name: 'Drinks', sortOrder: 3 }))

    const renamed = ok(await owner.api.catalog.categories({ id: created.id }).patch({ name: 'Beverages' }))
    const reordered = ok(await owner.api.catalog.categories({ id: created.id }).patch({ sortOrder: 7 }))

    expect(renamed).toEqual({ id: created.id, name: 'Beverages', sortOrder: 3, isActive: true })
    expect(reordered).toEqual({ id: created.id, name: 'Beverages', sortOrder: 7, isActive: true })
  })

  test('a duplicate name is a conflict on create and on rename', async () => {
    ok(await owner.api.catalog.categories.post({ name: 'Drinks' }))
    const snacks = ok(await owner.api.catalog.categories.post({ name: 'Snacks' }))

    const created = await owner.api.catalog.categories.post({ name: 'Drinks' })
    const renamed = await owner.api.catalog.categories({ id: snacks.id }).patch({ name: 'Drinks' })

    expect(created.status).toBe(409)
    expect(created.error?.value).toMatchObject({ code: 'DUPLICATE', message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' })
    expect(renamed.status).toBe(409)
    expect(renamed.error?.value).toMatchObject({ code: 'DUPLICATE', message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' })
    expect(ok(await owner.api.catalog.categories.get()).map((category) => category.name)).toEqual(['Drinks', 'Snacks'])
  })

  test('updating an unknown category is not found', async () => {
    const result = await owner.api.catalog.categories({ id: 9999 }).patch({ name: 'Ghost' })

    expect(result.status).toBe(404)
    expect(result.error?.value).toMatchObject({ code: 'NOT_FOUND', message: 'ไม่พบหมวดหมู่' })
  })

  test('an empty or over-long name is a validation error', async () => {
    const empty = await owner.api.catalog.categories.post({ name: '' })
    const tooLong = await owner.api.catalog.categories.post({ name: 'x'.repeat(101) })

    expect(empty.status).toBe(422)
    expect(empty.error?.value).toMatchObject({ code: 'VALIDATION' })
    expect(tooLong.status).toBe(422)
    expect(ok(await owner.api.catalog.categories.get())).toHaveLength(0)
  })

  test('a name of exactly 100 characters is accepted', async () => {
    const name = 'x'.repeat(100)

    expect(ok(await owner.api.catalog.categories.post({ name })).name).toBe(name)
  })

  test('an update with no fields returns the category unchanged', async () => {
    const created = ok(await owner.api.catalog.categories.post({ name: 'Drinks', sortOrder: 3 }))

    const unchanged = ok(await owner.api.catalog.categories({ id: created.id }).patch({}))

    expect(unchanged).toEqual(created)
  })
})
