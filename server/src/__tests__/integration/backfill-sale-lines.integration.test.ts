import { beforeEach, describe, expect, test } from 'bun:test'
import { client as sql } from '../../libs/db'
import { backfillSaleLines } from '../../infrastructure/database/backfill-sale-lines'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

// Sells two lines with a discount, then clears the shares the way a bill sold before they existed looks.
async function sellWithoutShares() {
  const tea = await seedProduct(owner, { priceSatang: 3333, stock: 5 })
  const cake = await seedProduct(owner, { priceSatang: 4001, stock: 5 })
  const sale = ok(
    await owner.api.sales.post({
      items: [
        { productId: tea.id, quantity: 1 },
        { productId: cake.id, quantity: 2 },
      ],
      discountSatang: 101,
      payments: [{ method: 'cash', amountSatang: 20000 }],
    }),
  )
  await sql`update sale_items set allocated_total_satang = null, allocated_vat_satang = null where sale_id = ${sale.id}`
  return sale
}

describe('backfilling the share of each line', () => {
  test('fills the lines of a sale so they add up to its total and VAT, and a second run does nothing', async () => {
    const sale = await sellWithoutShares()

    expect(await backfillSaleLines(1)).toBe(1)

    const items = await sql`select allocated_total_satang as total, allocated_vat_satang as vat from sale_items where sale_id = ${sale.id}`
    expect(items).toHaveLength(2)
    expect(items.reduce((s: number, i: { total: number }) => s + i.total, 0)).toBe(sale.totalSatang)
    expect(items.reduce((s: number, i: { vat: number }) => s + i.vat, 0)).toBe(sale.vatSatang)

    expect(await backfillSaleLines(1)).toBe(0)
  })

  test('gives each line the same share checkout wrote, not the whole total on one line', async () => {
    const tea = await seedProduct(owner, { priceSatang: 3333, stock: 5 })
    const cake = await seedProduct(owner, { priceSatang: 4001, stock: 5 })
    const juice = await seedProduct(owner, { priceSatang: 1777, stock: 5 })
    const sale = ok(
      await owner.api.sales.post({
        items: [
          { productId: tea.id, quantity: 1 },
          { productId: cake.id, quantity: 2 },
          { productId: juice.id, quantity: 3 },
        ],
        discountSatang: 101,
        payments: [{ method: 'cash', amountSatang: 30000 }],
      }),
    )
    const shares = () =>
      sql`select id, allocated_total_satang as total, allocated_vat_satang as vat from sale_items where sale_id = ${sale.id} order by id`
    const written = await shares()
    expect(written).toHaveLength(3)
    expect(written.every((line: { total: number | null }) => line.total !== null)).toBe(true)

    await sql`update sale_items set allocated_total_satang = null, allocated_vat_satang = null where sale_id = ${sale.id}`
    expect(await backfillSaleLines(1)).toBe(1)

    expect(await shares()).toEqual(written)
  })

  test('fills every line of several sales when they are spread over several batches', async () => {
    const sales = []
    for (let i = 0; i < 3; i++) sales.push(await sellWithoutShares())

    expect(await backfillSaleLines(1)).toBe(3)

    const unfilled = await sql`select id from sale_items where allocated_total_satang is null or allocated_vat_satang is null`
    expect(unfilled).toHaveLength(0)
    for (const sale of sales) {
      const items = await sql`select allocated_total_satang as total, allocated_vat_satang as vat from sale_items where sale_id = ${sale.id}`
      expect(items).toHaveLength(2)
      expect(items.reduce((s: number, i: { total: number }) => s + i.total, 0)).toBe(sale.totalSatang)
    }

    expect(await backfillSaleLines(1)).toBe(0)
  })

  test('leaves a sale that already has its shares untouched', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 5 })
    const sale = ok(await owner.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: [{ method: 'cash', amountSatang: 2500 }] }))
    const before = await sql`select allocated_total_satang as total from sale_items where sale_id = ${sale.id}`

    expect(await backfillSaleLines()).toBe(0)
    expect(await sql`select allocated_total_satang as total from sale_items where sale_id = ${sale.id}`).toEqual(before)
  })
})
