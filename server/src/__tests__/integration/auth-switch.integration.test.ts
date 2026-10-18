import { beforeEach, describe, expect, test } from 'bun:test'
import { container } from 'tsyringe'
import { baseUrl, client, ok, PASSWORD, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'
import { InMemoryPinGuard } from '../../modules/auth/adapters/in-memory-pin-guard'
import { pinGuardToken } from '../../modules/auth/applications/ports/pin-guard.port'
import '../../modules/di-registrations'

let owner: Session
let cashier: Session
let ownerCookie: string

const sessionCookieOf = (response: Response) => response.headers.getSetCookie()[0]?.split(';')[0]

async function loginCookie(username: string) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  })
  return sessionCookieOf(response)!
}

const switchTo = (cookie: string | undefined, body: unknown) =>
  fetch(`${baseUrl}/auth/switch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })

beforeEach(async () => {
  await resetDatabase()
  // The guard lives in memory for the whole process; each test starts with no failures counted.
  container.resolve<InMemoryPinGuard>(pinGuardToken).reset()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
  ownerCookie = await loginCookie('owner')
  ok(await owner.api.users({ id: cashier.user.id }).pin.put({ pin: '4321' }))
})

describe('switch routes need a session', () => {
  test('anonymous requests are refused', async () => {
    expect((await client()['auth']['switch-users'].get()).status).toBe(401)
    expect((await switchTo(undefined, { userId: cashier.user.id, pin: '4321' })).status).toBe(401)
  })
})

describe('listing who can take over', () => {
  test('only active users with a PIN, with only id and display name', async () => {
    const noPin = await signIn('cashier', 'nopin')
    const gone = await signIn('cashier', 'gone')
    ok(await owner.api.users({ id: gone.user.id }).pin.put({ pin: '5555' }))
    ok(await owner.api.users({ id: gone.user.id }).patch({ isActive: false }))

    const listed = ok(await owner.api.auth['switch-users'].get())

    expect(listed).toEqual({ items: [{ id: cashier.user.id, displayName: 'cashier' }], total: 1 })
    expect(listed.items.some((item) => item.id === noPin.user.id)).toBe(false)
  })
})

describe('switching with a PIN', () => {
  test('the right PIN starts a session for the target; a sale after it records the target as cashier', async () => {
    const response = await switchTo(ownerCookie, { userId: cashier.user.id, pin: '4321' })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ id: cashier.user.id, username: 'cashier', hasPin: true })
    expect(JSON.stringify(body)).not.toContain('4321')
    const newCookie = sessionCookieOf(response)
    expect(newCookie).toBeDefined()
    expect(newCookie).not.toBe(ownerCookie)

    const switched = client(newCookie)
    expect(ok(await switched.auth.me.get()).id).toBe(cashier.user.id)

    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 5 })
    const sale = ok(await switched.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: [{ method: 'cash', amountSatang: 2500 }] }))
    expect(sale.cashierId).toBe(cashier.user.id)
  })

  test('a wrong PIN answers 400 PIN_INVALID, sets no cookie and keeps the old session', async () => {
    const response = await switchTo(ownerCookie, { userId: cashier.user.id, pin: '1111' })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'PIN_INVALID' })
    expect(response.headers.getSetCookie()).toEqual([])
    expect(ok(await client(ownerCookie).auth.me.get()).id).toBe(owner.user.id)
  })

  test('a wrong PIN is in the audit log as auth.switch_failed, without the PIN tried', async () => {
    expect((await switchTo(ownerCookie, { userId: cashier.user.id, pin: '1111' })).status).toBe(400)

    const entries = ok(await owner.api['audit-logs'].get({ query: { action: 'auth.switch_failed' } })).items
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ actorId: owner.user.id, entityId: String(cashier.user.id) })
    expect(JSON.stringify(entries)).not.toContain('1111')
  })

  test('five wrong PINs lock that target with 409 PIN_LOCKED, even with the right PIN', async () => {
    for (let i = 0; i < 5; i++) expect((await switchTo(ownerCookie, { userId: cashier.user.id, pin: '1111' })).status).toBe(400)

    const locked = await switchTo(ownerCookie, { userId: cashier.user.id, pin: '4321' })

    expect(locked.status).toBe(409)
    expect(await locked.json()).toMatchObject({ code: 'PIN_LOCKED' })
    expect(locked.headers.getSetCookie()).toEqual([])
  })

  test('a target without a PIN answers 400 PIN_NOT_SET', async () => {
    const response = await switchTo(ownerCookie, { userId: owner.user.id, pin: '4321' })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'PIN_NOT_SET' })
  })

  test('the switch is in the audit log, without the PIN', async () => {
    expect((await switchTo(ownerCookie, { userId: cashier.user.id, pin: '4321' })).status).toBe(200)

    const entries = ok(await owner.api['audit-logs'].get({ query: { action: 'auth.switch' } })).items
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ actorId: owner.user.id, entityId: String(cashier.user.id) })
    expect(JSON.stringify(entries)).not.toContain('4321')
  })
})
