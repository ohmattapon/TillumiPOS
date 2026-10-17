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

  test('a closed branch cannot be worked in', async () => {
    ok(await owner.api.branches({ id: bkk.id }).patch({ isActive: false }))

    const blocked = await ownerInBkk.catalog.products.get({ query: {} })

    expect(blocked.status).toBe(409)
    expect(blocked.error?.value).toMatchObject({ code: 'BRANCH_INACTIVE' })
  })
})

describe('working in a branch', () => {
  test('a request without a branch uses the branch the user belongs to', async () => {
    const staff = await signIn('cashier', 'bkk-cashier', { branchId: bkk.id })
    const tea = await seedProduct(owner, { stock: 4, branchId: bkk.id })

    expect(await stockIn(staff.api, tea.id)).toBe(4)
    expect(await stockIn(owner.api, tea.id)).toBe(0)
  })

  test('a cashier cannot work in another branch, even by naming it', async () => {
    const intruder = await login('cashier', PASSWORD, bkk.id)

    const refused = await intruder.catalog.products.get({ query: {} })

    expect(refused.status).toBe(403)
    expect(refused.error?.value).toMatchObject({ code: 'BRANCH_FORBIDDEN' })
  })

  test('an unknown or malformed branch is refused', async () => {
    const unknown = await login('owner', PASSWORD, 9999)
    expect((await unknown.catalog.products.get({ query: {} })).status).toBe(404)

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

  test('a user is created in the branch the owner is working in unless another is named', async () => {
    const here = ok(
      await ownerInBkk.users.post({ username: 'a-user', password: PASSWORD, displayName: 'A', role: 'cashier' }),
    )
    const named = ok(
      await ownerInBkk.users.post({
        username: 'b-user',
        password: PASSWORD,
        displayName: 'B',
        role: 'cashier',
        branchId: MAIN_BRANCH_ID,
      }),
    )

    expect(here.branchId).toBe(bkk.id)
    expect(named.branchId).toBe(MAIN_BRANCH_ID)
  })

  test('a user cannot be assigned to a branch that does not exist', async () => {
    const refused = await owner.api.users({ id: cashier.user.id }).patch({ branchId: 9999 })

    expect(refused.status).toBe(404)
    expect(refused.error?.value).toMatchObject({ code: 'BRANCH_NOT_FOUND' })
  })
})

describe('stock and sales stay apart', () => {
  test('each branch keeps its own stock of the same product', async () => {
    const tea = await seedProduct(owner, { stock: 10 })
    ok(await ownerInBkk.inventory.receive.post({ productId: tea.id, quantity: 3 }))

    expect(await stockIn(owner.api, tea.id)).toBe(10)
    expect(await stockIn(ownerInBkk, tea.id)).toBe(3)
    const listed = ok(await ownerInBkk.catalog.products.get({ query: {} })).items.find((item) => item.id === tea.id)
    expect(listed?.stockQty).toBe(3)
  })

  test("a sale takes stock from its own branch only and is refused when that branch's shelf is empty", async () => {
    const tea = await seedProduct(owner, { stock: 10 })

    const refused = await sell(ownerInBkk, tea.id)
    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'INSUFFICIENT_STOCK' })

    ok(await sell(owner.api, tea.id, 4))
    expect(await stockIn(owner.api, tea.id)).toBe(6)
    expect(await stockIn(ownerInBkk, tea.id)).toBe(0)
  })

  test('receipt numbers carry the branch code and count separately per branch', async () => {
    const tea = await seedProduct(owner, { stock: 5 })
    ok(await ownerInBkk.inventory.receive.post({ productId: tea.id, quantity: 5 }))

    const main1 = ok(await sell(owner.api, tea.id))
    const bkk1 = ok(await sell(ownerInBkk, tea.id))
    const main2 = ok(await sell(owner.api, tea.id))

    expect(main1.receiptNo).toMatch(/^MAIN-\d{8}-00001$/)
    expect(bkk1.receiptNo).toMatch(/^BKK-\d{8}-00001$/)
    expect(main2.receiptNo).toMatch(/^MAIN-\d{8}-00002$/)
    expect([main1.branchId, bkk1.branchId]).toEqual([MAIN_BRANCH_ID, bkk.id])
  })

  test('the list, summary and detail of sales are those of the branch worked in', async () => {
    const tea = await seedProduct(owner, { stock: 5, priceSatang: 1000 })
    ok(await ownerInBkk.inventory.receive.post({ productId: tea.id, quantity: 5 }))
    ok(await sell(owner.api, tea.id, 2))
    const other = ok(await sell(ownerInBkk, tea.id, 1))

    const mainList = ok(await owner.api.sales.get({ query: {} }))
    const bkkList = ok(await ownerInBkk.sales.get({ query: {} }))
    expect([mainList.total, bkkList.total]).toEqual([1, 1])

    const period = { from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 3_600_000) }
    const mainSummary = ok(await owner.api.sales.summary.get({ query: period }))
    const bkkSummary = ok(await ownerInBkk.sales.summary.get({ query: period }))
    expect([mainSummary.totalSatang, bkkSummary.totalSatang]).toEqual([2000, 1000])

    // The other branch's bill is not visible from here, not even by id.
    expect((await owner.api.sales({ id: other.id }).get()).status).toBe(404)
    expect(ok(await ownerInBkk.sales({ id: other.id }).get()).receiptNo).toBe(other.receiptNo)
  })

  test("the stock ledger lists only the branch's own movements", async () => {
    const tea = await seedProduct(owner, { stock: 10 })
    ok(await ownerInBkk.inventory.receive.post({ productId: tea.id, quantity: 3 }))

    const main = ok(await owner.api.inventory.movements.get({ query: { productId: tea.id } }))
    const other = ok(await ownerInBkk.inventory.movements.get({ query: { productId: tea.id } }))

    expect(main.items.map((movement) => movement.branchId)).toEqual([MAIN_BRANCH_ID])
    expect(other.items.map((movement) => movement.branchId)).toEqual([bkk.id])
  })

  test("a void puts the stock back into the sale's branch and cannot be done from another", async () => {
    const tea = await seedProduct(owner, { stock: 5 })
    ok(await ownerInBkk.inventory.receive.post({ productId: tea.id, quantity: 5 }))
    const sale = ok(await sell(ownerInBkk, tea.id, 2))
    expect(await stockIn(ownerInBkk, tea.id)).toBe(3)

    const wrongBranch = await owner.api.sales({ id: sale.id }).void.post({ reason: 'ผิดสาขา' })
    expect(wrongBranch.status).toBe(404)

    ok(await ownerInBkk.sales({ id: sale.id }).void.post({ reason: 'คิดเงินผิด' }))
    expect(await stockIn(ownerInBkk, tea.id)).toBe(5)
    expect(await stockIn(owner.api, tea.id)).toBe(5)
  })

  test('two branches can sell the same product at the same time without affecting each other', async () => {
    const tea = await seedProduct(owner, { stock: 5 })
    ok(await ownerInBkk.inventory.receive.post({ productId: tea.id, quantity: 5 }))

    const results = await Promise.all([
      ...Array.from({ length: 8 }, () => sell(owner.api, tea.id)),
      ...Array.from({ length: 8 }, () => sell(ownerInBkk, tea.id)),
    ])

    const succeeded = (from: number, to: number) => results.slice(from, to).filter((result) => !result.error).length
    // Five on each shelf: exactly five of each branch's eight attempts get through.
    expect([succeeded(0, 8), succeeded(8, 16)]).toEqual([5, 5])
    expect(await stockIn(owner.api, tea.id)).toBe(0)
    expect(await stockIn(ownerInBkk, tea.id)).toBe(0)
  })
})
