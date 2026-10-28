import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, signIn, type Session } from '../../../test/harness'

const previousMode = Bun.env.CHECKOUT_MODE
let owner: Session
let cashier: Session

beforeEach(async () => {
  Bun.env.CHECKOUT_MODE = 'shifts'
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

afterEach(() => {
  if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
  else Bun.env.CHECKOUT_MODE = previousMode
})

describe('reading one shift', () => {
  test('a signed-in user reads a shift of the branch by its id', async () => {
    const registerId = ok(await owner.apiV2.registers.get()).items[0]!.id
    const opened = ok(await cashier.apiV2.shifts.post({ registerId, openingCashSatang: 5000 }, { headers: { 'idempotency-key': crypto.randomUUID() } }))

    const read = ok(await owner.apiV2.shifts({ id: opened.id }).get())

    expect(read).toMatchObject({ id: opened.id, registerId, status: 'open', openingCashSatang: 5000 })
  })

  test('an unknown shift is not found', async () => {
    const missing = await owner.apiV2.shifts({ id: 99999 }).get()

    expect(missing.status).toBe(404)
    expect(missing.error?.value).toMatchObject({ code: 'SHIFT_NOT_FOUND' })
  })
})
