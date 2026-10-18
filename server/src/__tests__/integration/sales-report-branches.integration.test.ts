import { beforeEach, describe, expect, test } from 'bun:test'
import { client as sql } from '../../libs/db'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
const range = { from: '2026-01-02', to: '2026-01-02' }

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

describe('the sales report by branch', () => {
  test('lists each branch that sold in the period, with its name and total', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 5 })
    const sale = ok(await owner.api.sales.post({ items: [{ productId: tea.id, quantity: 2 }], payments: [{ method: 'cash', amountSatang: 5000 }] }))
    await sql`update sales set created_at = ${new Date('2026-01-02T03:00:00Z')} where id = ${sale.id}`

    const report = ok(await owner.api.sales.reports.branches.get({ query: range }))

    expect(report.total).toBe(1)
    expect(report.items[0]).toMatchObject({ branchId: 1, branchName: expect.any(String), saleCount: 1, totalSatang: 5000 })
  })

  test('a period with no sales has no rows', async () => {
    expect(ok(await owner.api.sales.reports.branches.get({ query: range }))).toEqual({ items: [], total: 0 })
  })
})
