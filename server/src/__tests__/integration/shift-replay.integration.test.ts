import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, signIn, type Session } from '../../../test/harness'

const previousMode = Bun.env.CHECKOUT_MODE
let owner: Session
let shiftId: number

const key = () => crypto.randomUUID()
const withKey = (value: string) => ({ headers: { 'idempotency-key': value } })
const shift = () => owner.apiV2.shifts({ id: shiftId })

beforeEach(async () => {
  Bun.env.CHECKOUT_MODE = 'shifts'
  await resetDatabase()
  owner = await signIn('owner')
  const registerId = ok(await owner.apiV2.registers.get()).items[0]!.id
  shiftId = ok(await owner.apiV2.shifts.post({ registerId, openingCashSatang: 10_000 }, withKey(key()))).id
})

afterEach(() => {
  if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
  else Bun.env.CHECKOUT_MODE = previousMode
})

/** A client that never saw the answer sends the same request with the same key and must get the same answer back. */
describe('repeating a shift command with the same key', () => {
  test('records a cash movement once', async () => {
    const same = withKey(key())
    const body = { kind: 'cash_in' as const, amountSatang: 5_000, reason: 'เติมเงินทอน' }

    const first = ok(await shift()['cash-entries'].post(body, same))
    const again = ok(await shift()['cash-entries'].post(body, same))

    expect(again).toEqual(first)
    expect(ok(await shift()['cash-entries'].get({ query: {} })).total).toBe(1)
  })

  test('starts counting once, and the answer is the same shift', async () => {
    const same = withKey(key())

    const first = ok(await shift()['start-closing'].post({}, same))
    const again = ok(await shift()['start-closing'].post({}, same))

    expect(again).toEqual(first)
    expect(again.closingRevision).toBe(first.closingRevision)
  })

  test('cancels counting once', async () => {
    const closing = ok(await shift()['start-closing'].post({}, withKey(key())))
    const same = withKey(key())

    const first = ok(await shift()['cancel-closing'].post({ closingRevision: closing.closingRevision }, same))
    const again = ok(await shift()['cancel-closing'].post({ closingRevision: closing.closingRevision }, same))

    expect(again).toEqual(first)
    expect(again.status).toBe('open')
  })

  test('closes the shift once', async () => {
    const closing = ok(await shift()['start-closing'].post({}, withKey(key())))
    const same = withKey(key())
    const body = { closingRevision: closing.closingRevision, countedCashSatang: 10_000 }

    const first = ok(await shift().close.post(body, same))
    const again = ok(await shift().close.post(body, same))

    expect(again).toEqual(first)
    expect(again.status).toBe('closed')
  })
})
