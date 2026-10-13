import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const stockOf = async (id: number) => ok(await owner.api.catalog.products({ id }).get()).stockQty

const sellThree = async () => {
  const tea = await seedProduct(owner, { priceSatang: 1000, stock: 10 })
  const sale = ok(
    await owner.api.sales.post({
      items: [{ productId: tea.id, quantity: 3 }],
      payments: [{ method: 'cash', amountSatang: 3000 }],
    }),
  )
  return { tea, sale }
}

describe('voiding a sale', () => {
  test('marks it voided, restores stock and records the reversal', async () => {
    const { tea, sale } = await sellThree()

    const voided = ok(await owner.api.sales({ id: sale.id }).void.post({ reason: 'wrong item' }))

    expect(voided).toMatchObject({ status: 'voided', voidReason: 'wrong item', totalSatang: 3000 })
    expect(voided.voidedAt).toBeInstanceOf(Date)
    expect(voided.items).toEqual(sale.items)
    expect(await stockOf(tea.id)).toBe(10)
    const [latest] = ok(await owner.api.inventory.movements.get({ query: { productId: tea.id } }))
    expect(latest).toMatchObject({ type: 'void', quantity: 3, balanceAfter: 10, reference: sale.receiptNo })
  })

  test('cannot be done twice and does not restore stock twice', async () => {
    const { tea, sale } = await sellThree()
    ok(await owner.api.sales({ id: sale.id }).void.post({ reason: 'wrong item' }))

    const again = await owner.api.sales({ id: sale.id }).void.post({ reason: 'again' })

    expect(again.status).toBe(409)
    expect(again.error?.value).toMatchObject({ code: 'ALREADY_VOIDED' })
    expect(await stockOf(tea.id)).toBe(10)
  })

  test('an unknown sale is not found', async () => {
    const result = await owner.api.sales({ id: 9999 }).void.post({ reason: 'nothing' })

    expect(result.status).toBe(404)
  })

  test('a voided sale no longer counts in the summary', async () => {
    const { tea, sale } = await sellThree()
    ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 1 }],
        payments: [{ method: 'cash', amountSatang: 1000 }],
      }),
    )
    ok(await owner.api.sales({ id: sale.id }).void.post({ reason: 'wrong item' }))

    const hour = 60 * 60 * 1000
    const summary = ok(
      await owner.api.sales.summary.get({ query: { from: new Date(Date.now() - hour), to: new Date(Date.now() + hour) } }),
    )

    expect(summary).toMatchObject({ saleCount: 1, totalSatang: 1000 })
  })
})
