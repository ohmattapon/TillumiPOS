import { beforeEach, describe, expect, test } from 'bun:test'
import { app } from '../../app'
import { client, login, ok, PASSWORD, pngFile, resetDatabase, seedProduct, signIn } from '../../../test/harness'

beforeEach(() => resetDatabase())

describe('login', () => {
  test('starts a session and returns the user without any password field', async () => {
    const { api } = await signIn('owner', 'boss')

    expect(ok(await api.auth.me.get())).toEqual({
      id: expect.any(Number),
      username: 'boss',
      displayName: 'boss',
      role: 'owner',
      roleId: expect.any(Number),
      branchId: 1,
      isActive: true,
    })
  })

  test('answers a wrong password and an unknown user identically', async () => {
    await signIn('owner', 'boss')

    const wrongPassword = await client().auth.login.post({ username: 'boss', password: 'wrong-password' })
    const unknownUser = await client().auth.login.post({ username: 'nobody', password: PASSWORD })

    expect(wrongPassword.status).toBe(401)
    expect(unknownUser.status).toBe(401)
    expect(unknownUser.error?.value).toEqual(wrongPassword.error?.value)
  })

  test('protected routes refuse requests without a session', async () => {
    const result = await client().catalog.products.get({ query: {} })

    expect(result.status).toBe(401)
    expect(result.error?.value).toMatchObject({ code: 'UNAUTHORIZED' })
  })

  test('a garbage session cookie is refused, not an internal error', async () => {
    const result = await client('session=not-a-jwt').auth.me.get()

    expect(result.status).toBe(401)
  })

  test('a tampered session cookie is refused, not an internal error', async () => {
    await signIn('owner', 'boss')
    const response = await fetch(`http://localhost:${app.server!.port}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'boss', password: PASSWORD }),
    })
    const cookie = response.headers.getSetCookie()[0]!.split(';')[0]!
    const [name, token] = cookie.split('=')
    const segments = token!.split('.')
    segments[2] = `${segments[2]![0] === 'a' ? 'b' : 'a'}${segments[2]!.slice(1)}`
    const result = await client(`${name}=${segments.join('.')}`).auth.me.get()

    expect(result.status).toBe(401)
  })
})

describe('roles', () => {
  test('a cashier is refused on every owner-only route', async () => {
    const owner = await signIn('owner')
    const cashier = await signIn('cashier')
    const product = await seedProduct(owner, { stock: 5 })
    const category = ok(await owner.api.catalog.categories.post({ name: 'Drinks' }))
    const sale = ok(
      await cashier.api.sales.post({
        items: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'cash', amountSatang: product.priceSatang }],
      }),
    )
    const hour = 60 * 60 * 1000

    // Every body is valid, so a 403 can only come from the role check.
    const attempts = await Promise.all([
      cashier.api.users.get(),
      cashier.api.users.post({ username: 'newbie', password: PASSWORD, displayName: 'New', role: 'cashier' }),
      cashier.api.users({ id: owner.user.id }).patch({ displayName: 'Renamed' }),
      cashier.api.catalog.categories.post({ name: 'Drinks' }),
      cashier.api.catalog.categories({ id: category.id }).patch({ name: 'Renamed drinks' }),
      cashier.api.catalog.products.post({ sku: 'NEW-1', name: 'New', priceSatang: 100 }),
      cashier.api.catalog.products({ id: product.id }).patch({ priceSatang: 1 }),
      cashier.api.catalog.products({ id: product.id }).image.put({ file: pngFile() }),
      cashier.api.catalog.products({ id: product.id }).image.delete(),
      cashier.api.inventory.receive.post({ productId: product.id, quantity: 1 }),
      cashier.api.inventory.adjust.post({ productId: product.id, countedQty: 1 }),
      cashier.api.sales({ id: sale.id }).void.post({ reason: 'mistake' }),
      cashier.api.sales.summary.get({ query: { from: new Date(Date.now() - hour), to: new Date(Date.now() + hour) } }),
    ])

    expect(attempts.map((attempt) => attempt.status)).toEqual(attempts.map(() => 403))
  })

  test('deactivating a user ends their session and blocks new logins', async () => {
    const owner = await signIn('owner')
    const cashier = await signIn('cashier')

    ok(await owner.api.users({ id: cashier.user.id }).patch({ isActive: false }))

    expect((await cashier.api.auth.me.get()).status).toBe(401)
    await expect(login('cashier')).rejects.toThrow('failed with 401')
  })

  test('the last active owner cannot be deactivated or demoted', async () => {
    const owner = await signIn('owner')

    const deactivate = await owner.api.users({ id: owner.user.id }).patch({ isActive: false })
    const demote = await owner.api.users({ id: owner.user.id }).patch({ role: 'cashier' })

    expect(deactivate.status).toBe(409)
    expect(deactivate.error?.value).toMatchObject({ code: 'LAST_OWNER' })
    expect(demote.status).toBe(409)
    expect(ok(await owner.api.auth.me.get()).role).toBe('owner')
  })

  test('an owner can be demoted once another active owner exists', async () => {
    const first = await signIn('owner', 'first')
    const second = await signIn('owner', 'second')

    const demoted = ok(await first.api.users({ id: second.user.id }).patch({ role: 'cashier' }))

    expect(demoted.role).toBe('cashier')
  })
})
