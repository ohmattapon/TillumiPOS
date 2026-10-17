import { beforeEach, describe, expect, test } from 'bun:test'
import { login, ok, PASSWORD, resetDatabase, signIn, type Session } from '../../../test/harness'

let owner: Session
beforeEach(async () => { await resetDatabase(); owner = await signIn('owner') })
const create = (name = 'ผู้จัดการ', permissions: string[] = ['reports.read']) => owner.api.roles.post({ name, permissions })

describe('roles', () => {
  test('an owner creates a role and assigns it to a user', async () => {
    const role = ok(await create())
    expect(role).toMatchObject({ name: 'ผู้จัดการ', permissions: ['reports.read'], systemKey: null, userCount: 0 })
    const user = ok(await owner.api.users.post({ username: 'manager', password: PASSWORD, displayName: 'ผู้จัดการ', roleId: role.id }))
    expect(user).toMatchObject({ role: 'cashier', roleId: role.id })
    expect(ok(await (await login('manager')).auth.me.get()).roleId).toBe(role.id)
    const listed = ok(await owner.api.roles.get({ query: {} }))
    expect(listed.items.find((item) => item.id === role.id)?.userCount).toBe(1)
  })
  test('a cashier cannot list or mutate roles', async () => {
    const cashier = await signIn('cashier')
    const role = ok(await create())
    for (const response of [await cashier.api.roles.get({ query: {} }), await cashier.api.roles.post({ name: 'อื่น', permissions: [] }),
      await cashier.api.roles({ id: role.id }).patch({ name: 'อื่น' }), await cashier.api.roles({ id: role.id }).delete()]) {
      expect(response.status).toBe(403)
      expect(response.error?.value).toMatchObject({ code: 'PERMISSION_DENIED' })
    }
  })
  test('system roles cannot be deleted and roles held by inactive users remain protected', async () => {
    const listed = ok(await owner.api.roles.get({ query: {} }))
    expect(listed.items.map((role) => role.systemKey)).toEqual(['owner', 'cashier'])
    for (const role of listed.items) {
      const result = await owner.api.roles({ id: role.id }).delete()
      expect(result.status).toBe(409)
      expect(result.error?.value).toMatchObject({ code: 'ROLE_PROTECTED' })
    }
    const role = ok(await create())
    const user = ok(await owner.api.users.post({ username: 'manager', password: PASSWORD, displayName: 'ผู้จัดการ', roleId: role.id }))
    ok(await owner.api.users({ id: user.id }).patch({ isActive: false }))
    const result = await owner.api.roles({ id: role.id }).delete()
    expect(result.status).toBe(409)
    expect(result.error?.value).toMatchObject({ code: 'ROLE_IN_USE' })
  })
  test('duplicate names are rejected during creation and update without changing stored permissions', async () => {
    ok(await create())
    const duplicate = await create()
    expect(duplicate.status).toBe(409)
    expect(duplicate.error?.value).toMatchObject({ code: 'ROLE_NAME_TAKEN' })
    const other = ok(await create('อื่น', ['sales.void']))
    const conflict = await owner.api.roles({ id: other.id }).patch({ name: 'ผู้จัดการ', permissions: [] })
    expect(conflict.status).toBe(409)
    expect(conflict.error?.value).toMatchObject({ code: 'ROLE_NAME_TAKEN' })
    expect(ok(await owner.api.roles.get({ query: {} })).items.find((role) => role.id === other.id)?.permissions).toEqual(['sales.void'])
  })
  test('updates permissions, paginates lists, and deletes unused custom roles', async () => {
    const role = ok(await create())
    const updated = ok(await owner.api.roles({ id: role.id }).patch({ permissions: ['sales.void', 'sales.void'] }))
    expect(updated.permissions).toEqual(['sales.void'])
    const page = ok(await owner.api.roles.get({ query: { limit: 1, offset: 2 } }))
    expect(page).toMatchObject({ total: 3, items: [{ id: role.id }] })
    expect(ok(await owner.api.roles({ id: role.id }).delete())).toEqual({ ok: true })
    const missing = await owner.api.roles({ id: role.id }).patch({ name: 'หาย' })
    expect(missing.status).toBe(404)
    expect(missing.error?.value).toMatchObject({ code: 'ROLE_NOT_FOUND' })
  })
  test('owner fields and system names are protected while cashier permissions are editable', async () => {
    const roles = ok(await owner.api.roles.get({ query: {} })).items
    const ownerRole = roles.find((role) => role.systemKey === 'owner')!
    const cashierRole = roles.find((role) => role.systemKey === 'cashier')!
    const protectedOwner = await owner.api.roles({ id: ownerRole.id }).patch({ permissions: [] })
    expect(protectedOwner.status).toBe(409)
    expect(protectedOwner.error?.value).toMatchObject({ code: 'ROLE_PROTECTED' })
    const renamed = await owner.api.roles({ id: cashierRole.id }).patch({ name: 'อื่น' })
    expect(renamed.status).toBe(409)
    expect(renamed.error?.value).toMatchObject({ code: 'ROLE_PROTECTED' })
    expect(ok(await owner.api.roles({ id: cashierRole.id }).patch({ permissions: ['reports.read'] })).permissions).toEqual(['reports.read'])
  })
  test('unknown permissions are rejected before persisting a role', async () => {
    const result = await create('สิทธิ์ผิด', ['sales.fly'])
    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'INVALID_ROLE' })
    expect(ok(await owner.api.roles.get({ query: {} })).total).toBe(2)
  })
})
