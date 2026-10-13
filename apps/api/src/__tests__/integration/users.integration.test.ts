import { beforeEach, describe, expect, test } from 'bun:test'
import { login, ok, PASSWORD, resetDatabase, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const createCashier = (username = 'somchai') =>
  owner.api.users.post({ username, password: PASSWORD, displayName: 'สมชาย', role: 'cashier' })

describe('users', () => {
  test('a created user exposes exactly the public fields, never the password', async () => {
    const created = ok(await createCashier())

    expect(created).toEqual({
      id: expect.any(Number),
      username: 'somchai',
      displayName: 'สมชาย',
      role: 'cashier',
      branchId: 1,
      isActive: true,
    })
  })

  test('usernames are stored in lower case and matched case-insensitively at login', async () => {
    const created = ok(await createCashier('SomChai'))

    expect(created.username).toBe('somchai')
    const session = await login('SOMCHAI')
    expect(ok(await session.auth.me.get()).id).toBe(created.id)
  })

  test('a username that differs only by case is a duplicate', async () => {
    ok(await createCashier('somchai'))

    const again = await createCashier('Somchai')

    expect(again.status).toBe(409)
    expect(again.error?.value).toMatchObject({ code: 'DUPLICATE', detail: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' })
  })

  test('the list is ordered by id', async () => {
    ok(await createCashier('zed'))
    ok(await createCashier('abe'))

    const listed = ok(await owner.api.users.get()).items

    expect(listed.map((user) => user.username)).toEqual(['owner', 'zed', 'abe'])
  })

  test('a partial update changes only the given fields', async () => {
    const created = ok(await createCashier())

    const renamed = ok(await owner.api.users({ id: created.id }).patch({ displayName: 'สมชาย ใจดี' }))
    const promoted = ok(await owner.api.users({ id: created.id }).patch({ role: 'owner' }))

    expect(renamed).toEqual({ ...created, displayName: 'สมชาย ใจดี' })
    expect(promoted).toEqual({ ...created, displayName: 'สมชาย ใจดี', role: 'owner' })
  })

  test('changing a password invalidates the old one', async () => {
    const created = ok(await createCashier())

    ok(await owner.api.users({ id: created.id }).patch({ password: 'a-new-password' }))

    await expect(login('somchai', PASSWORD)).rejects.toThrow('failed with 401')
    expect(ok(await (await login('somchai', 'a-new-password')).auth.me.get()).id).toBe(created.id)
  })

  test('updating an unknown user is not found', async () => {
    const result = await owner.api.users({ id: 9999 }).patch({ displayName: 'ผี' })

    expect(result.status).toBe(404)
    expect(result.error?.value).toMatchObject({ code: 'NOT_FOUND', detail: 'ไม่พบผู้ใช้' })
  })

  test('a short password or an invalid username is a validation error', async () => {
    const shortPassword = await owner.api.users.post({
      username: 'somchai',
      password: '1234567',
      displayName: 'สมชาย',
      role: 'cashier',
    })
    const badUsername = await owner.api.users.post({
      username: 'som chai',
      password: PASSWORD,
      displayName: 'สมชาย',
      role: 'cashier',
    })

    expect(shortPassword.status).toBe(422)
    expect(badUsername.status).toBe(422)
    expect(ok(await owner.api.users.get()).items).toHaveLength(1)
  })

  test('an update with no fields returns the user unchanged', async () => {
    const created = ok(await createCashier())

    const unchanged = ok(await owner.api.users({ id: created.id }).patch({}))

    expect(unchanged).toEqual(created)
  })
})
