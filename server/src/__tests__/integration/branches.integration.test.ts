import { beforeEach, describe, expect, test } from 'bun:test'
import { client as sql } from '../../libs/db'
import { baseUrl, ok, login, MAIN_BRANCH_ID, PASSWORD, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const stockIn = async (api: Session['api'], id: number) => ok(await api.catalog.products({ id }).get()).stockQty
const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]

describe('one branch', () => {
  test('an owner cannot add a second branch, and nothing is stored', async () => {
    const refused = await owner.api.branches.post({ code: 'cm01', name: 'สาขาเชียงใหม่' })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'SINGLE_BRANCH_ONLY' })
    expect(ok(await owner.api.branches.get()).items.map((branch) => branch.code)).toEqual(['MAIN'])
  })

  test('a cashier cannot add a branch either', async () => {
    expect((await cashier.api.branches.post({ code: 'XX', name: 'x' })).status).toBe(403)
  })

  test('the main branch cannot be closed', async () => {
    const refused = await owner.api.branches({ id: MAIN_BRANCH_ID }).patch({ isActive: false })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'MAIN_BRANCH_REQUIRED' })
    expect(ok(await owner.api.branches.get()).items[0]?.isActive).toBe(true)
  })

  test('the main branch can be renamed, but its code never changes', async () => {
    const updated = ok(
      await owner.api.branches({ id: MAIN_BRANCH_ID }).patch({ name: 'ร้านทดสอบ', code: 'NEW' } as never),
    )

    expect(updated).toMatchObject({ code: 'MAIN', name: 'ร้านทดสอบ' })
  })

  test('an owner and a cashier both see the one branch', async () => {
    const forOwner = ok(await owner.api.branches.get()).items.map((branch) => branch.code)
    const forCashier = ok(await cashier.api.branches.get()).items.map((branch) => branch.code)

    expect(forOwner).toEqual(['MAIN'])
    expect(forCashier).toEqual(['MAIN'])
  })
})

describe('working in a branch', () => {
  test('a request works in MAIN without a header', async () => {
    const tea = await seedProduct(owner, { stock: 4 })

    expect(await stockIn(cashier.api, tea.id)).toBe(4)
  })

  test('a header naming another branch is ignored, and the request works in MAIN', async () => {
    const tea = await seedProduct(owner, { stock: 4 })
    const elsewhere = await login('cashier', PASSWORD, 9999)

    expect(await stockIn(elsewhere, tea.id)).toBe(4)
  })

  test('a header that is not a number is still refused', async () => {
    const session = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: PASSWORD }),
    })
    const cookie = session.headers.getSetCookie()[0]!.split(';')[0]!
    const malformed = await fetch(`${baseUrl}/catalog/products`, { headers: { cookie, 'x-branch-id': 'abc' } })

    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toMatchObject({ code: 'INVALID_BRANCH_ID' })
  })

  test('a user assigned to a second branch sells in MAIN, with MAIN receipt numbers and stock movements', async () => {
    // No use case can create a second branch any more, so the row that an older install may hold is inserted directly.
    const [elsewhere] = await sql`insert into branches (code, name) values ('BKK', 'สาขากรุงเทพ') returning id`
    const staff = await signIn('cashier', 'bkk-cashier', { branchId: elsewhere!.id })
    const tea = await seedProduct(owner, { stock: 4 })

    const sale = ok(await staff.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(10_000) }))

    expect(sale.branchId).toBe(MAIN_BRANCH_ID)
    expect(sale.receiptNo).toMatch(/^MAIN-/)
    const movements = ok(await owner.api.inventory.movements.get({ query: { productId: tea.id } })).items
    expect(movements.map((movement) => movement.branchId)).toEqual(expect.arrayContaining([MAIN_BRANCH_ID]))
    expect(movements.every((movement) => movement.branchId === MAIN_BRANCH_ID)).toBe(true)
    expect(await stockIn(owner.api, tea.id)).toBe(3)
  })

  test('a user created without a branch belongs to MAIN', async () => {
    const created = ok(
      await owner.api.users.post({ username: 'a-user', password: PASSWORD, displayName: 'A', role: 'cashier' }),
    )

    expect(created.branchId).toBe(MAIN_BRANCH_ID)
  })

  test('a user cannot be assigned to a branch that does not exist', async () => {
    const refused = await owner.api.users({ id: cashier.user.id }).patch({ branchId: 9999 })

    expect(refused.status).toBe(404)
    expect(refused.error?.value).toMatchObject({ code: 'BRANCH_NOT_FOUND' })
  })
})
