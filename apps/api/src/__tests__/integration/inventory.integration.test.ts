import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const stockOf = async (id: number) => ok(await owner.api.catalog.products({ id }).get()).stockQty
const movementsOf = async (productId: number) => ok(await owner.api.inventory.movements.get({ query: { productId } })).items

describe('inventory', () => {
  test('receiving adds stock and records the movement with its running balance', async () => {
    const product = await seedProduct(owner)

    const first = ok(await owner.api.inventory.receive.post({ productId: product.id, quantity: 10, note: 'PO-1' }))
    const second = ok(await owner.api.inventory.receive.post({ productId: product.id, quantity: 5 }))

    expect(first).toMatchObject({ type: 'receive', quantity: 10, balanceAfter: 10, note: 'PO-1', userId: owner.user.id })
    expect(second).toMatchObject({ type: 'receive', quantity: 5, balanceAfter: 15, note: null })
    expect(await stockOf(product.id)).toBe(15)
    // Newest first.
    expect((await movementsOf(product.id)).map((movement) => movement.balanceAfter)).toEqual([15, 10])
  })

  test('a stock count records the signed difference and sets the balance to the count', async () => {
    const product = await seedProduct(owner, { stock: 10 })

    const down = ok(await owner.api.inventory.adjust.post({ productId: product.id, countedQty: 7, note: 'damaged' }))
    const up = ok(await owner.api.inventory.adjust.post({ productId: product.id, countedQty: 12 }))

    expect(down).toMatchObject({ type: 'adjust', quantity: -3, balanceAfter: 7, note: 'damaged' })
    expect(up).toMatchObject({ type: 'adjust', quantity: 5, balanceAfter: 12 })
    expect(await stockOf(product.id)).toBe(12)
    expect((await movementsOf(product.id)).slice(0, 2).map(({ quantity, balanceAfter }) => ({ quantity, balanceAfter })))
      .toEqual([{ quantity: 5, balanceAfter: 12 }, { quantity: -3, balanceAfter: 7 }])
  })

  test('a count equal to the current balance is rejected and records nothing', async () => {
    const product = await seedProduct(owner, { stock: 10 })

    const result = await owner.api.inventory.adjust.post({ productId: product.id, countedQty: 10 })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'NO_CHANGE' })
    expect(await movementsOf(product.id)).toHaveLength(1)
  })

  test('products that do not track stock cannot be received or counted', async () => {
    const service = await seedProduct(owner, { trackStock: false })

    const receive = await owner.api.inventory.receive.post({ productId: service.id, quantity: 1 })
    const adjust = await owner.api.inventory.adjust.post({ productId: service.id, countedQty: 1 })

    expect(receive.status).toBe(400)
    expect(receive.error?.value).toMatchObject({ code: 'STOCK_NOT_TRACKED' })
    expect(adjust.status).toBe(400)
    expect(await movementsOf(service.id)).toHaveLength(0)
  })

  test('an unknown product is not found', async () => {
    const result = await owner.api.inventory.receive.post({ productId: 9999, quantity: 1 })

    expect(result.status).toBe(404)
  })
})
