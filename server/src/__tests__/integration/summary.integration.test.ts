import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const HOUR = 60 * 60 * 1000
const around = (from: number, to: number) => ({ from: new Date(Date.now() + from), to: new Date(Date.now() + to) })
const summaryFor = async (range: { from: Date; to: Date }) => ok(await owner.api.sales.summary.get({ query: range }))

describe('sales summary', () => {
  test('adds up count, revenue, VAT, discount, profit and takings by method', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, costSatang: 1500, stock: 10 })
    // 2 x 25.00 - 5.00 discount = 45.00, paid 50.00 cash, change 5.00
    ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 2 }],
        discountSatang: 500,
        payments: [{ method: 'cash', amountSatang: 5000 }],
      }),
    )
    // 1 x 25.00 by PromptPay
    ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 1 }],
        payments: [{ method: 'promptpay', amountSatang: 2500 }],
      }),
    )

    expect(await summaryFor(around(-HOUR, HOUR))).toEqual({
      saleCount: 2,
      totalSatang: 7000,
      vatSatang: 294 + 164, // 4500 * 7 / 107 = 294.4 and 2500 * 7 / 107 = 163.6, rounded per sale
      discountSatang: 500,
      profitSatang: 7000 - 3 * 1500,
      byMethod: [
        { method: 'cash', amountSatang: 4500 },
        { method: 'promptpay', amountSatang: 2500 },
      ],
    })
  })

  test('cash takings are net of the change handed back', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 10 })
    ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 1 }],
        payments: [{ method: 'cash', amountSatang: 100000 }],
      }),
    )

    expect((await summaryFor(around(-HOUR, HOUR))).byMethod).toEqual([{ method: 'cash', amountSatang: 1000 }])
  })

  test('sales outside the requested period are excluded', async () => {
    const tea = await seedProduct(owner, { stock: 10 })
    ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 1 }],
        payments: [{ method: 'cash', amountSatang: 1000 }],
      }),
    )

    expect(await summaryFor(around(-48 * HOUR, -24 * HOUR))).toEqual({
      saleCount: 0,
      totalSatang: 0,
      vatSatang: 0,
      discountSatang: 0,
      profitSatang: 0,
      byMethod: [],
    })
  })

  test('the period end is exclusive', async () => {
    const tea = await seedProduct(owner, { stock: 10 })
    const sale = ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 1 }],
        payments: [{ method: 'cash', amountSatang: 1000 }],
      }),
    )

    const { client: sqlClient } = await import('../../libs/db')
    const { assertConnectedTestDatabase } = await import('../../../test/database')
    const boundary = new Date('2026-01-15T10:00:00.000Z')
    await assertConnectedTestDatabase(sqlClient)
    // Fixture only: exact millisecond precision in both PostgreSQL and JS Date.
    await sqlClient`update sales set created_at = ${boundary} where id = ${sale.id}`
    const endingAtSale = await summaryFor({ from: new Date(boundary.getTime() - HOUR), to: boundary })
    const startingAtSale = await summaryFor({ from: boundary, to: new Date(boundary.getTime() + HOUR) })

    expect(endingAtSale.saleCount).toBe(0)
    expect(startingAtSale.saleCount).toBe(1)
  })
})
