import { beforeEach, describe, expect, test } from 'bun:test'
import { container } from 'tsyringe'
import { ok, PASSWORD, resetDatabase, signIn } from '../../../test/harness'
import { DomainNotFoundError } from '../../domains/errors/domain-not-found.error'
import '../../modules/di-registrations'
import type { IUnitOfWork } from '../../modules/shared/ports/unit-of-work.port'
import { TOKENS } from '../../modules/tokens'
import { userRepositoryToken, type IUserRepository } from '../../modules/users/applications/ports/user.repository'
import { makeUser } from '../factories'

const users = container.resolve<IUserRepository>(userRepositoryToken)
const unitOfWork = container.resolve<IUnitOfWork>(TOKENS.UnitOfWork)
const run = <T>(work: () => Promise<T>) => unitOfWork.run(work)

// resetDatabase recreates the system roles with the cashier role as id 2.
const CASHIER_ROLE_ID = 2

const createUser = (username: string, displayName: string, isActive = true) =>
  run(() => users.create(makeUser({ id: 0, username, displayName, roleId: CASHIER_ROLE_ID, isActive }), 'password-hash'))

beforeEach(() => resetDatabase())

describe('user PIN storage', () => {
  test('a new user has no PIN', async () => {
    const user = await createUser('somchai', 'สมชาย')

    expect(user.hasPin).toBe(false)
    expect((await run(() => users.findById(user.id)))!.hasPin).toBe(false)
    expect(await run(() => users.findPinHash(user.id))).toBeNull()
  })

  test('setting a PIN hash makes hasPin true and is the only way to read the hash', async () => {
    const user = await createUser('somchai', 'สมชาย')

    await run(() => users.setPinHash(user.id, 'h'))

    expect((await run(() => users.findById(user.id)))!.hasPin).toBe(true)
    expect((await run(() => users.findAll()))[0]!.hasPin).toBe(true)
    expect(await run(() => users.findPinHash(user.id))).toBe('h')
  })

  test('clearing the PIN removes it', async () => {
    const user = await createUser('somchai', 'สมชาย')
    await run(() => users.setPinHash(user.id, 'h'))

    await run(() => users.setPinHash(user.id, null))

    expect((await run(() => users.findById(user.id)))!.hasPin).toBe(false)
    expect(await run(() => users.findPinHash(user.id))).toBeNull()
  })

  test('updating a user never touches the PIN', async () => {
    const user = await createUser('somchai', 'สมชาย')
    await run(() => users.setPinHash(user.id, 'h'))

    const stale = user.with({ displayName: 'สมชาย ใจดี' })
    const saved = await run(() => users.update(stale))

    expect(saved.hasPin).toBe(true)
    expect(await run(() => users.findPinHash(user.id))).toBe('h')
  })

  test('a deactivated user has no usable PIN and is not switchable', async () => {
    const user = await createUser('somchai', 'สมชาย', false)
    await run(() => users.setPinHash(user.id, 'h'))

    expect(await run(() => users.findPinHash(user.id))).toBeNull()
    expect(await run(() => users.findSwitchable())).toEqual([])
  })

  test('findSwitchable lists active users with a PIN, ordered by display name', async () => {
    const b = await createUser('bobby', 'บอล')
    const a = await createUser('aom', 'อ้อม')
    await createUser('kong', 'ก้อง')
    await run(() => users.setPinHash(a.id, 'h'))
    await run(() => users.setPinHash(b.id, 'h'))

    expect(await run(() => users.findSwitchable())).toEqual([
      { id: b.id, displayName: 'บอล' },
      { id: a.id, displayName: 'อ้อม' },
    ])
  })

  test('setting a PIN for a missing user is not found', async () => {
    await expect(run(() => users.setPinHash(9999, 'h'))).rejects.toBeInstanceOf(DomainNotFoundError)
  })

  test('findPasswordHashById reads the password hash, null for a missing user', async () => {
    const user = await createUser('somchai', 'สมชาย')

    expect(await run(() => users.findPasswordHashById(user.id))).toBe('password-hash')
    expect(await run(() => users.findPasswordHashById(9999))).toBeNull()
  })
})

describe('setting PINs over HTTP', () => {
  test('an owner sets a cashier PIN; hasPin shows in the response and in the list, never the PIN', async () => {
    const owner = await signIn('owner')
    const cashier = await signIn('cashier')

    const response = ok(await owner.api.users({ id: cashier.user.id }).pin.put({ pin: '4321' }))

    expect(response.hasPin).toBe(true)
    expect(JSON.stringify(response)).not.toContain('4321')
    const listed = ok(await owner.api.users.get()).items.find((item) => item.id === cashier.user.id)!
    expect(listed.hasPin).toBe(true)
  })

  test('an owner clears a PIN with null', async () => {
    const owner = await signIn('owner')
    const cashier = await signIn('cashier')
    ok(await owner.api.users({ id: cashier.user.id }).pin.put({ pin: '4321' }))

    expect(ok(await owner.api.users({ id: cashier.user.id }).pin.put({ pin: null })).hasPin).toBe(false)
  })

  test('an invalid PIN answers 400 INVALID_PIN', async () => {
    const owner = await signIn('owner')
    const cashier = await signIn('cashier')

    const result = await owner.api.users({ id: cashier.user.id }).pin.put({ pin: '12' })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'INVALID_PIN' })
  })

  test('a cashier cannot set another user PIN', async () => {
    const owner = await signIn('owner')
    const cashier = await signIn('cashier')

    expect((await cashier.api.users({ id: owner.user.id }).pin.put({ pin: '4321' })).status).toBe(403)
  })

  test('an owner cannot set their own PIN through the users route, only through /auth/me/pin', async () => {
    const owner = await signIn('owner')

    const result = await owner.api.users({ id: owner.user.id }).pin.put({ pin: '4321' })

    expect(result.status).toBe(403)
    expect(result.error?.value).toMatchObject({ code: 'OWN_PIN_USE_ACCOUNT' })
    expect(ok(await owner.api.auth.me.get()).hasPin).toBe(false)
  })

  test('a user changes their own PIN with the current password; /auth/me shows hasPin', async () => {
    const cashier = await signIn('cashier')

    const response = ok(await cashier.api.auth.me.pin.put({ currentPassword: PASSWORD, pin: '654321' }))

    expect(response.hasPin).toBe(true)
    expect(ok(await cashier.api.auth.me.get()).hasPin).toBe(true)
  })

  test('a wrong current password answers 400 INVALID_PASSWORD and the session still works', async () => {
    const cashier = await signIn('cashier')

    const result = await cashier.api.auth.me.pin.put({ currentPassword: 'wrong-password', pin: '4321' })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'INVALID_PASSWORD' })
    expect(ok(await cashier.api.auth.me.get()).hasPin).toBe(false)
  })
})
