import { beforeEach, describe, expect, test } from 'bun:test'
import {
  baseUrl,
  ok,
  login,
  MAIN_BRANCH_ID,
  PASSWORD,
  resetDatabase,
  seedBranch,
  seedProduct,
  signIn,
  type Api,
  type Session,
} from '../../../test/harness'

let owner: Session
let cashier: Session
let bkk: { id: number; code: string }
/** The owner, working in the second branch. */
let ownerInBkk: Api

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
  bkk = await seedBranch('BKK', 'สาขากรุงเทพ')
  ownerInBkk = await login('owner', PASSWORD, bkk.id)
})

const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]
const sell = (api: Api, productId: number, quantity = 1) =>
  api.sales.post({ items: [{ productId, quantity }], payments: cash(100_000) })
const stockIn = async (api: Api, id: number) => ok(await api.catalog.products({ id }).get()).stockQty

describe('managing branches', () => {
  test('an owner creates a branch; the code is stored in upper case and the branch starts open', async () => {
    const created = ok(await owner.api.branches.post({ code: 'cm01', name: 'สาขาเชียงใหม่', phone: '053-000-000' }))

    expect(created).toEqual({
      id: expect.any(Number),
      code: 'CM01',
      name: 'สาขาเชียงใหม่',
      address: null,
      phone: '053-000-000',
      isActive: true,
    })
  })

  test('a code can be used once, however it is typed', async () => {
    const duplicate = await owner.api.branches.post({ code: 'bkk', name: 'ซ้ำ' })

    expect(duplicate.status).toBe(409)
    expect(duplicate.error?.value).toMatchObject({ code: 'BRANCH_CODE_TAKEN' })
  })

  test('only an owner may create or change a branch', async () => {
    expect((await cashier.api.branches.post({ code: 'XX', name: 'x' })).status).toBe(403)
    expect((await cashier.api.branches({ id: bkk.id }).patch({ name: 'x' })).status).toBe(403)
  })

  test('an owner sees every branch, a cashier only their own', async () => {
    const forOwner = ok(await owner.api.branches.get()).items.map((branch) => branch.code)
    const forCashier = ok(await cashier.api.branches.get()).items.map((branch) => branch.code)

    expect(forOwner).toEqual(['BKK', 'MAIN'])
    expect(forCashier).toEqual(['MAIN'])
  })

  test('the details change but the code never does', async () => {
    const updated = ok(
      await owner.api.branches({ id: bkk.id }).patch({ name: 'กรุงเทพ 2', address: 'ถนนสุขุมวิท', code: 'NEW' } as never),
    )

    expect(updated).toMatchObject({ code: 'BKK', name: 'กรุงเทพ 2', address: 'ถนนสุขุมวิท' })
  })

  test('a branch with working staff cannot be closed until they move', async () => {
    const staff = await signIn('cashier', 'bkk-cashier', { branchId: bkk.id })

    const refused = await owner.api.branches({ id: bkk.id }).patch({ isActive: false })
    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'BRANCH_IN_USE' })

    ok(await owner.api.users({ id: staff.user.id }).patch({ branchId: MAIN_BRANCH_ID }))
    expect(ok(await owner.api.branches({ id: bkk.id }).patch({ isActive: false })).isActive).toBe(false)
  })

  test('the last open branch cannot be closed', async () => {
    ok(await owner.api.branches({ id: bkk.id }).patch({ isActive: false }))

    const refused = await owner.api.branches({ id: MAIN_BRANCH_ID }).patch({ isActive: false })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'BRANCH_IN_USE' })
  })
})

describe('working in a branch', () => {
  test('a request without a branch works in MAIN', async () => {
    const tea = await seedProduct(owner, { stock: 4 })

    expect(await stockIn(cashier.api, tea.id)).toBe(4)
  })

  test('a cashier assigned to another branch still works in MAIN', async () => {
    const staff = await signIn('cashier', 'bkk-cashier', { branchId: bkk.id })
    const tea = await seedProduct(owner, { stock: 4 })

    expect(await stockIn(staff.api, tea.id)).toBe(4)
  })

  test('a header naming another branch is ignored, and the request works in MAIN', async () => {
    const tea = await seedProduct(owner, { stock: 4 })

    expect(await stockIn(ownerInBkk, tea.id)).toBe(4)
    expect((await cashier.api.catalog.products.get({ query: {} })).status).toBe(200)
  })

  test('a closed branch named in the header does not stop requests, which work in MAIN', async () => {
    ok(await owner.api.branches({ id: bkk.id }).patch({ isActive: false }))

    const tea = await seedProduct(owner, { stock: 4 })

    expect(await stockIn(ownerInBkk, tea.id)).toBe(4)
  })

  test('an unknown branch in the header is ignored', async () => {
    const unknown = await login('owner', PASSWORD, 9999)

    expect((await unknown.catalog.products.get({ query: {} })).status).toBe(200)
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

  test('who-am-I and the branch list still answer when the chosen branch has been closed', async () => {
    const stale = await login('owner', PASSWORD, bkk.id)
    ok(await owner.api.branches({ id: bkk.id }).patch({ isActive: false }))

    expect(ok(await stale.auth.me.get()).username).toBe('owner')
    expect(ok(await stale.branches.get()).items.length).toBe(2)
  })

  test('a user created without a branch belongs to MAIN', async () => {
    const created = ok(
      await ownerInBkk.users.post({ username: 'a-user', password: PASSWORD, displayName: 'A', role: 'cashier' }),
    )

    expect(created.branchId).toBe(MAIN_BRANCH_ID)
  })

  test('a user cannot be assigned to a branch that does not exist', async () => {
    const refused = await owner.api.users({ id: cashier.user.id }).patch({ branchId: 9999 })

    expect(refused.status).toBe(404)
    expect(refused.error?.value).toMatchObject({ code: 'BRANCH_NOT_FOUND' })
  })
})
