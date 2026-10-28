import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, signIn } from '../../../test/harness'

const previousMode = Bun.env.CHECKOUT_MODE
const idempotency = () => ({ headers: { 'idempotency-key': crypto.randomUUID() } })
let owner: Awaited<ReturnType<typeof signIn>>
let cashier: Awaited<ReturnType<typeof signIn>>

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

describe('registers', () => {
  test('a register code can be used once in a branch', async () => {
    ok(await owner.apiV2.registers.post({ code: 'FRONT', name: 'หน้าร้าน' }))

    const again = await owner.apiV2.registers.post({ code: 'FRONT', name: 'อีกเครื่อง' })

    expect(again.status).toBe(409)
    expect(again.error?.value).toMatchObject({ code: 'REGISTER_CODE_TAKEN' })
  })

  test('the owner renames a register and the list shows the new name', async () => {
    const created = ok(await owner.apiV2.registers.post({ code: 'FRONT', name: 'หน้าร้าน' }))

    const renamed = ok(await owner.apiV2.registers({ id: created.id }).patch({ name: 'ริมถนน' }))

    expect(renamed).toMatchObject({ id: created.id, name: 'ริมถนน', isActive: true })
    expect(ok(await owner.apiV2.registers.get()).items.map((register) => register.name)).toContain('ริมถนน')
  })

  test('a register without an open shift can be deactivated and reactivated', async () => {
    const created = ok(await owner.apiV2.registers.post({ code: 'FRONT', name: 'หน้าร้าน' }))

    const off = ok(await owner.apiV2.registers({ id: created.id }).patch({ isActive: false }))
    const on = ok(await owner.apiV2.registers({ id: created.id }).patch({ isActive: true }))

    expect(off.isActive).toBe(false)
    expect(on.isActive).toBe(true)
  })

  test('a register with an open shift cannot be deactivated', async () => {
    const register = ok(await owner.apiV2.registers.get()).items[0]!
    ok(await cashier.apiV2.shifts.post({ registerId: register.id, openingCashSatang: 0 }, idempotency()))

    const blocked = await owner.apiV2.registers({ id: register.id }).patch({ isActive: false })

    expect(blocked.status).toBe(409)
    expect(blocked.error?.value).toMatchObject({ code: 'REGISTER_IN_USE' })
  })

  test('an unknown register is not found, and a cashier cannot edit one', async () => {
    const missing = await owner.apiV2.registers({ id: 99999 }).patch({ name: 'ผี' })
    const register = ok(await owner.apiV2.registers.get()).items[0]!
    const forbidden = await cashier.apiV2.registers({ id: register.id }).patch({ name: 'แอบเปลี่ยน' })

    expect(missing.status).toBe(404)
    expect(forbidden.status).toBe(403)
  })
})
