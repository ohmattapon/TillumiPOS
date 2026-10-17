import { beforeEach, describe, expect, test } from 'bun:test'
import { baseUrl, ok, resetDatabase, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const tenPercent = { name: 'ลด 10%', kind: 'percent' as const, value: 1000 }

/** A promotion's day as YYYY-MM-DD, whether the client gives the string or a Date at midnight UTC. */
const day = (value: unknown) => (value === null ? null : new Date(value as string).toISOString().slice(0, 10))

describe('promotion management', () => {
  test('the owner creates a promotion with defaults and both roles read it', async () => {
    const created = ok(await owner.api.promotions.post(tenPercent))
    expect(created).toMatchObject({
      name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: null, minSubtotalSatang: 0,
      startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
      audience: 'everyone', isActive: true,
    })
    expect(ok(await cashier.api.promotions({ id: created.id }).get())).toMatchObject({ id: created.id })
    expect(ok(await cashier.api.promotions.get({ query: {} }))).toMatchObject({ total: 1, items: [{ id: created.id }] })
  })

  test('keeps every rule that was sent', async () => {
    const created = ok(
      await owner.api.promotions.post({
        name: 'ศุกร์ดึก', kind: 'percent', value: 500, maxDiscountSatang: 2000, minSubtotalSatang: 30000,
        startsOn: '2026-10-01', endsOn: '2026-12-31', weekdays: [5, 6], windowStartMinute: 1320, windowEndMinute: 120,
        audience: 'members',
      }),
    )
    expect(created).toMatchObject({
      maxDiscountSatang: 2000, minSubtotalSatang: 30000,
      weekdays: [5, 6], windowStartMinute: 1320, windowEndMinute: 120, audience: 'members',
    })
    expect(day(created.startsOn)).toBe('2026-10-01')
    expect(day(created.endsOn)).toBe('2026-12-31')
  })

  test('edits keep what was not sent, null clears a bound, and the promotion is switched off, never deleted', async () => {
    const created = ok(await owner.api.promotions.post({ ...tenPercent, maxDiscountSatang: 500, endsOn: '2026-12-31' }))
    const edited = ok(await owner.api.promotions({ id: created.id }).patch({ maxDiscountSatang: null, isActive: false }))
    expect(edited).toMatchObject({ name: 'ลด 10%', maxDiscountSatang: null, isActive: false })
    expect(day(edited.endsOn)).toBe('2026-12-31')
    const remove = await fetch(`${baseUrl}/promotions/${created.id}`, { method: 'DELETE' })
    expect(remove.status).toBe(404)
    expect(ok(await owner.api.promotions.get({ query: { isActive: false } })).items.map((item) => item.id)).toEqual([created.id])
    expect(ok(await owner.api.promotions.get({ query: { isActive: true } }))).toMatchObject({ items: [], total: 0 })
  })

  test('only the owner changes promotions', async () => {
    const created = ok(await owner.api.promotions.post(tenPercent))
    expect((await cashier.api.promotions.post(tenPercent)).status).toBe(403)
    expect((await cashier.api.promotions({ id: created.id }).patch({ isActive: false })).status).toBe(403)
    expect(ok(await owner.api.promotions({ id: created.id }).get()).isActive).toBe(true)
  })

  test('refuses rules that do not hold together, duplicate names and unknown ids', async () => {
    const tooMuch = await owner.api.promotions.post({ name: 'x', kind: 'percent', value: 10001 })
    expect(tooMuch.status).toBe(400)
    expect(tooMuch.error?.value).toMatchObject({ code: 'INVALID_PROMOTION' })
    const capOnFixed = await owner.api.promotions.post({ name: 'y', kind: 'fixed', value: 500, maxDiscountSatang: 100 })
    expect(capOnFixed.error?.value).toMatchObject({ code: 'INVALID_PROMOTION' })
    const reversed = await owner.api.promotions.post({ ...tenPercent, startsOn: '2026-12-01', endsOn: '2026-11-01' })
    expect(reversed.error?.value).toMatchObject({ code: 'INVALID_PROMOTION' })

    ok(await owner.api.promotions.post(tenPercent))
    const duplicate = await owner.api.promotions.post({ ...tenPercent, name: '  ลด 10%  ' })
    expect(duplicate.status).toBe(409)
    expect(duplicate.error?.value).toMatchObject({ code: 'PROMOTION_NAME_TAKEN' })
    const sameWords = await owner.api.promotions.post({ name: 'LOWER', kind: 'fixed', value: 1 })
    expect(sameWords.error).toBeNull()
    expect((await owner.api.promotions.post({ name: 'lower', kind: 'fixed', value: 1 })).status).toBe(409)

    expect((await owner.api.promotions({ id: 99999 }).get()).status).toBe(404)
    expect((await owner.api.promotions({ id: 99999 }).patch({ isActive: false })).status).toBe(404)
  })

  test('requires a session', async () => {
    expect((await fetch(`${baseUrl}/promotions`)).status).toBe(401)
  })

  test('pages the list and always answers { items, total }', async () => {
    for (const name of ['A', 'B', 'C']) ok(await owner.api.promotions.post({ name, kind: 'fixed', value: 100 }))
    const first = ok(await owner.api.promotions.get({ query: { limit: 2, offset: 0 } }))
    expect(first.total).toBe(3)
    expect(first.items.map((item) => item.name)).toEqual(['A', 'B'])
    expect(ok(await owner.api.promotions.get({ query: { limit: 2, offset: 2 } })).items.map((item) => item.name)).toEqual(['C'])
  })
})
