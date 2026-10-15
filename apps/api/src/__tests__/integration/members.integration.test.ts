import { beforeEach, describe, expect, test } from 'bun:test'
import { client as sql } from '../../libs/db'
import { baseUrl, login, ok, resetDatabase, seedBranch, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]
const member = async (phone = '0812345678', name = 'สมาชิกเดิม') =>
  ok(await cashier.api.members.post({ name, phone }))

describe('member directory', () => {
  test('cashiers register normalized identities and both roles read the shared directory', async () => {
    const created = await member('+66 (81) 234-5678', '  ลูกค้าประจำ  ')
    expect(created).toMatchObject({ name: 'ลูกค้าประจำ', phone: '0812345678', isActive: true })
    expect(created.code).toBeTruthy()
    expect(ok(await cashier.api.members({ id: created.id }).get())).toMatchObject(created)
    expect(ok(await owner.api.members.get({ query: { limit: 1, offset: 0 } }))).toMatchObject({
      total: 1,
      items: [{ id: created.id }],
    })
    for (const search of ['ลูกค้าประจำ', '0812345678', created.code]) {
      expect(ok(await cashier.api.members.get({ query: { search } })).items.map((item) => item.id)).toEqual([created.id])
    }
    expect(ok(await cashier.api.members.get({ query: { search: 'ไม่พบสมาชิก' } }))).toMatchObject({ items: [], total: 0 })
  })

  test('simultaneous normalized duplicates create exactly one member', async () => {
    const results = await Promise.all([
      cashier.api.members.post({ name: 'A', phone: '+66 81 234 5678' }),
      owner.api.members.post({ name: 'B', phone: '081-234-5678' }),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    const listed = ok(await owner.api.members.get({ query: {} }))
    expect(listed.total).toBe(1)
    expect(listed.items[0]?.phone).toBe('0812345678')
  })

  test('only owners edit or deactivate and an inactive phone remains reserved', async () => {
    const created = await member()
    const forbidden = await cashier.api.members({ id: created.id }).patch({ name: 'เปลี่ยนชื่อ', isActive: false })
    expect(forbidden.status).toBe(403)
    expect(ok(await owner.api.members({ id: created.id }).get())).toMatchObject({ name: created.name, isActive: true })
    const updated = ok(await owner.api.members({ id: created.id }).patch({ name: 'ชื่อใหม่', isActive: false }))
    expect(updated).toMatchObject({ code: created.code, name: 'ชื่อใหม่', isActive: false })
    expect((await cashier.api.members.post({ name: 'ซ้ำ', phone: '66812345678' })).status).toBe(409)
    expect(ok(await cashier.api.members.get({ query: { isActive: true } }))).toMatchObject({ items: [], total: 0 })
    expect(ok(await cashier.api.members.get({ query: { isActive: false } })).items.map((item) => item.id)).toEqual([created.id])
    expect(ok(await cashier.api.members({ id: created.id }).sales.get({ query: {} }))).toMatchObject({
      items: [], total: 0, summary: { saleCount: 0, totalSatang: 0 },
    })
  })

  test('rejects invalid identity, unauthenticated access and unknown members', async () => {
    expect((await fetch(`${baseUrl}/members`)).status).toBe(401)
    expect((await cashier.api.members.post({ name: ' ', phone: '0812345678' })).status).toBe(422)
    expect((await cashier.api.members.post({ name: 'A', phone: 'phone123' })).status).toBe(400)
    expect((await cashier.api.members({ id: 99999 }).get()).status).toBe(404)
  })
})

describe('member checkout snapshots', () => {
  test('keeps immutable receipt identity without phone and preserves anonymous checkout', async () => {
    const created = await member()
    const product = await seedProduct(owner, { stock: 5, priceSatang: 2500 })
    const sale = ok(await cashier.api.sales.post({
      memberId: created.id, items: [{ productId: product.id, quantity: 1 }], payments: cash(3000),
    }))
    const snapshot = { id: created.id, code: created.code, name: created.name }
    expect(sale.member).toEqual(snapshot)
    expect(sale).toMatchObject({ subtotalSatang: 2500, discountSatang: 0, totalSatang: 2500, changeSatang: 500 })
    ok(await owner.api.members({ id: created.id }).patch({ name: 'ชื่อหลังขาย', phone: '0899999999', isActive: false }))
    expect(ok(await owner.api.sales({ id: sale.id }).get()).member).toEqual(snapshot)
    expect(ok(await owner.api.sales.get({ query: {} })).items[0]?.member).toEqual(snapshot)
    const anonymous = ok(await cashier.api.sales.post({
      items: [{ productId: product.id, quantity: 1 }], payments: cash(2500),
    }))
    expect(anonymous.member).toBeNull()
  })

  test('rejects inactive or missing members without taking stock or recording a sale', async () => {
    const created = await member()
    const product = await seedProduct(owner, { stock: 2 })
    ok(await owner.api.members({ id: created.id }).patch({ isActive: false }))
    for (const memberId of [created.id, 99999]) {
      const result = await cashier.api.sales.post({
        memberId, items: [{ productId: product.id, quantity: 1 }], payments: cash(1000),
      })
      expect(result.status).toBe(memberId === created.id ? 409 : 404)
    }
    expect(ok(await owner.api.catalog.products({ id: product.id }).get()).stockQty).toBe(2)
    expect(ok(await owner.api.sales.get({ query: {} })).total).toBe(0)
  })

  test('v2 direct and order checkout retain member snapshots on idempotent replay', async () => {
    const previousMode = Bun.env.CHECKOUT_MODE
    Bun.env.CHECKOUT_MODE = 'shifts'
    try {
      const created = await member()
      const product = await seedProduct(owner, { stock: 5 })
      const headers = () => ({ headers: { 'idempotency-key': crypto.randomUUID() } })
      const register = ok(await owner.apiV2.registers.get()).items[0]!
      const shift = ok(await cashier.apiV2.shifts.post({ registerId: register.id, openingCashSatang: 0 }, headers()))
      const directBody = {
        shiftId: shift.id, memberId: created.id,
        items: [{ productId: product.id, quantity: 1 }], payments: cash(1000),
      }
      const directHeaders = headers()
      const direct = ok(await cashier.apiV2.sales.post(directBody, directHeaders))
      const order = ok(await cashier.api.orders.post({
        memberId: created.id, items: [{ productId: product.id, quantity: 1 }],
      }))
      const orderBody = { shiftId: shift.id, payments: cash(1000) }
      const orderHeaders = headers()
      const paid = ok(await cashier.apiV2.orders({ id: order.id }).pay.post(orderBody, orderHeaders))
      const snapshot = { id: created.id, code: created.code, name: created.name }
      expect(direct.member).toEqual(snapshot)
      expect(paid.member).toEqual(snapshot)
      ok(await owner.api.members({ id: created.id }).patch({ name: 'เปลี่ยนแล้ว', isActive: false }))
      expect(ok(await cashier.apiV2.sales.post(directBody, directHeaders))).toMatchObject({ id: direct.id, member: snapshot })
      expect(ok(await cashier.apiV2.orders({ id: order.id }).pay.post(orderBody, orderHeaders))).toMatchObject({ id: paid.id, member: snapshot })
      expect(ok(await owner.api.catalog.products({ id: product.id }).get()).stockQty).toBe(3)
    } finally {
      if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
      else Bun.env.CHECKOUT_MODE = previousMode
    }
  })
})

describe('order membership', () => {
  test('sets and clears membership while open and snapshots the member when paid', async () => {
    const created = await member()
    const product = await seedProduct(owner, { stock: 5 })
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 1 }] }))
    expect(order.memberId).toBeNull()
    expect(ok(await cashier.api.orders({ id: order.id }).member.patch({ memberId: created.id })).memberId).toBe(created.id)
    expect(ok(await cashier.api.orders({ id: order.id }).member.patch({ memberId: null })).memberId).toBeNull()
    ok(await cashier.api.orders({ id: order.id }).member.patch({ memberId: created.id }))
    const sale = ok(await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(1000) }))
    expect(sale.member).toEqual({ id: created.id, code: created.code, name: created.name })
    expect((await cashier.api.orders({ id: order.id }).member.patch({ memberId: null })).status).toBe(409)
  })

  test('requires explicit clearing after an attached member is deactivated', async () => {
    const created = await member()
    const product = await seedProduct(owner, { stock: 5 })
    const order = ok(await cashier.api.orders.post({ memberId: created.id, items: [{ productId: product.id, quantity: 1 }] }))
    ok(await owner.api.members({ id: created.id }).patch({ isActive: false }))
    expect((await cashier.api.orders.post({ memberId: created.id })).status).toBe(409)
    expect((await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(1000) })).status).toBe(409)
    expect(ok(await cashier.api.orders({ id: order.id }).get())).toMatchObject({ status: 'open', memberId: created.id })
    expect(ok(await owner.api.catalog.products({ id: product.id }).get()).stockQty).toBe(5)
    ok(await cashier.api.orders({ id: order.id }).member.patch({ memberId: null }))
    expect(ok(await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(1000) })).member).toBeNull()
  })

  test('split inherits membership and merge rejects conflicts without changing either order', async () => {
    const first = await member()
    const second = await member('0899999999', 'อีกคน')
    const product = await seedProduct(owner, { stock: 10 })
    const original = ok(await cashier.api.orders.post({
      memberId: first.id, items: [{ productId: product.id, quantity: 3 }],
    }))
    const split = ok(await cashier.api.orders({ id: original.id }).split.post({
      lines: [{ lineId: original.items[0]!.lineId, quantity: 1 }],
    }))
    expect(split.memberId).toBe(first.id)
    expect(ok(await cashier.api.orders({ id: original.id }).get()).memberId).toBe(first.id)
    ok(await cashier.api.orders({ id: split.id }).member.patch({ memberId: second.id }))
    expect((await cashier.api.orders({ id: original.id }).merge.post({ sourceOrderId: split.id })).status).toBe(409)
    expect(ok(await cashier.api.orders({ id: original.id }).get())).toMatchObject({ memberId: first.id, itemCount: 2 })
    expect(ok(await cashier.api.orders({ id: split.id }).get())).toMatchObject({ memberId: second.id, status: 'open', itemCount: 1 })
    ok(await cashier.api.orders({ id: original.id }).member.patch({ memberId: null }))
    const merged = ok(await cashier.api.orders({ id: original.id }).merge.post({ sourceOrderId: split.id }))
    expect(merged).toMatchObject({ memberId: second.id, itemCount: 3 })
  })
})

describe('branch-scoped purchase history', () => {
  test('shares members but keeps branch sales and order mutations isolated', async () => {
    const created = await member()
    const branch = await seedBranch()
    const otherCashier = await signIn('cashier', 'bkk-cashier', { branchId: branch.id })
    const otherOwner = await login('owner', undefined, branch.id)
    const mainProduct = await seedProduct(owner, { stock: 5 })
    const otherProduct = await seedProduct(owner, { stock: 5, branchId: branch.id })
    const mainSale = ok(await cashier.api.sales.post({
      memberId: created.id, items: [{ productId: mainProduct.id, quantity: 1 }], payments: cash(1000),
    }))
    const otherSale = ok(await otherCashier.api.sales.post({
      memberId: created.id, items: [{ productId: otherProduct.id, quantity: 1 }], payments: cash(1000),
    }))
    expect(ok(await otherCashier.api.members({ id: created.id }).get()).id).toBe(created.id)
    const mainHistory = ok(await cashier.api.members({ id: created.id }).sales.get({ query: {} }))
    expect(mainHistory.items.map((sale) => sale.id)).toEqual([mainSale.id])
    expect(mainHistory.summary).toEqual({ saleCount: 1, totalSatang: 1000 })
    expect(ok(await otherOwner.members({ id: created.id }).sales.get({ query: {} })).items.map((sale) => sale.id)).toEqual([otherSale.id])
    const denied = await login('cashier', undefined, branch.id)
    expect((await denied.members({ id: created.id }).sales.get({ query: {} })).status).toBe(403)
    const order = ok(await cashier.api.orders.post({ memberId: created.id }))
    expect((await otherCashier.api.orders({ id: order.id }).member.patch({ memberId: null })).status).toBe(404)
  })

  test('filters civil days in shop timezone, paginates independently of summary and excludes voided totals', async () => {
    const created = await member()
    const product = await seedProduct(owner, { stock: 10, priceSatang: 1000 })
    ok(await owner.api.settings.patch({ timeZone: 'Asia/Bangkok' }))
    const sell = async () => ok(await cashier.api.sales.post({
      memberId: created.id, items: [{ productId: product.id, quantity: 1 }], payments: cash(1000),
    }))
    const before = await sell()
    const first = await sell()
    const voided = await sell()
    const after = await sell()
    await sql`update sales set created_at = '2026-10-13T16:59:59Z' where id = ${before.id}`
    await sql`update sales set created_at = '2026-10-13T17:00:00Z' where id = ${first.id}`
    await sql`update sales set created_at = '2026-10-14T16:59:59Z' where id = ${voided.id}`
    await sql`update sales set created_at = '2026-10-14T17:00:00Z' where id = ${after.id}`
    ok(await owner.api.sales({ id: voided.id }).void.post({ reason: 'คิดเงินผิด' }))
    const query = { from: '2026-10-14', to: '2026-10-14', limit: 1, offset: 0 }
    const page = ok(await cashier.api.members({ id: created.id }).sales.get({ query }))
    expect(page).toMatchObject({ total: 2, summary: { saleCount: 1, totalSatang: 1000 } })
    expect(page.items.map((sale) => sale.id)).toEqual([voided.id])
    const next = ok(await cashier.api.members({ id: created.id }).sales.get({ query: { ...query, offset: 1 } }))
    expect(next.items.map((sale) => sale.id)).toEqual([first.id])
    expect(next.summary).toEqual(page.summary)
    const completed = ok(await cashier.api.members({ id: created.id }).sales.get({ query: { ...query, status: 'completed' } }))
    expect(completed).toMatchObject({ total: 1, summary: { saleCount: 1, totalSatang: 1000 } })
    expect(completed.items[0]?.id).toBe(first.id)
    const cancelled = ok(await cashier.api.members({ id: created.id }).sales.get({ query: { ...query, status: 'voided' } }))
    expect(cancelled).toMatchObject({ total: 1, summary: { saleCount: 0, totalSatang: 0 } })
    expect(cancelled.items[0]).toMatchObject({ id: voided.id, status: 'voided', totalSatang: 1000 })
    expect((await cashier.api.members({ id: created.id }).sales.get({ query: { from: '2026-02-30' } })).status).toBe(422)
  })
})
