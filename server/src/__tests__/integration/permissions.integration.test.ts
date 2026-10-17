import { beforeEach, expect, test } from 'bun:test'
import { PERMISSIONS } from '../../domains/permission.vo'
import { ok, resetDatabase, seedBranch, seedProduct, signIn, signInWithRole } from '../../../test/harness'

beforeEach(() => resetDatabase())
const range = { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' }

test('the system cashier can sell but cannot void, adjust stock, or read reports', async () => {
  const owner = await signIn('owner')
  const cashier = await signIn('cashier')
  const product = await seedProduct(owner, { stock: 5 })
  const sale = ok(await cashier.api.sales.post({ items: [{ productId: product.id, quantity: 1 }],
    payments: [{ method: 'cash', amountSatang: product.priceSatang }] }))
  for (const [response, permission] of [
    [await cashier.api.sales({ id: sale.id }).void.post({ reason: 'mistake' }), 'sales.void'],
    [await cashier.api.inventory.adjust.post({ productId: product.id, countedQty: 1, note: 'count' }), 'inventory.adjust'],
    [await cashier.api.sales.summary.get({ query: range }), 'reports.read'],
  ] as const) {
    expect(response.status).toBe(403)
    expect(response.error?.value).toMatchObject({ code: 'PERMISSION_DENIED', params: { permission } })
  }
})

test('custom grants take effect on the next request and do not grant role management', async () => {
  const owner = await signIn('owner')
  const role = ok(await owner.api.roles.post({ name: 'Manager', permissions: ['reports.read'] }))
  const manager = await signInWithRole('manager', role.id)
  expect((await manager.api.sales.summary.get({ query: range })).status).toBe(200)
  expect((await manager.api.roles.get({ query: {} })).status).toBe(403)
  ok(await owner.api.roles({ id: role.id }).patch({ permissions: [] }))
  const denied = await manager.api.sales.summary.get({ query: range })
  expect(denied.status).toBe(403)
  expect(denied.error?.value).toMatchObject({ code: 'PERMISSION_DENIED', params: { permission: 'reports.read' } })
  ok(await owner.api.roles({ id: role.id }).patch({ permissions: ['reports.read'] }))
  expect((await manager.api.sales.summary.get({ query: range })).status).toBe(200)
})

test('/auth/me returns effective permissions, role id and role name without credentials', async () => {
  const owner = await signIn('owner')
  const cashier = await signIn('cashier')
  const role = ok(await owner.api.roles.post({ name: 'Report reader', permissions: ['reports.read'] }))
  const manager = await signInWithRole('manager', role.id)
  expect(ok(await owner.api.auth.me.get()).permissions).toEqual([...PERMISSIONS])
  expect(ok(await cashier.api.auth.me.get()).permissions).toEqual([])
  const me = ok(await manager.api.auth.me.get())
  expect(me).toMatchObject({ roleId: role.id, roleName: 'Report reader', permissions: ['reports.read'], role: 'cashier' })
  expect(me).not.toHaveProperty('password')
  expect(me).not.toHaveProperty('passwordHash')
})

test('role reassignment and account deactivation apply to an existing session immediately', async () => {
  const owner = await signIn('owner')
  const role = ok(await owner.api.roles.post({ name: 'Reports', permissions: ['reports.read'] }))
  const manager = await signInWithRole('manager', role.id)
  const cashier = await signIn('cashier')
  ok(await owner.api.users({ id: manager.user.id }).patch({ roleId: cashier.user.roleId }))
  expect((await manager.api.sales.summary.get({ query: range })).status).toBe(403)
  expect(ok(await manager.api.auth.me.get()).roleId).toBe(cashier.user.roleId)
  ok(await owner.api.users({ id: manager.user.id }).patch({ isActive: false }))
  expect((await manager.api.auth.me.get()).status).toBe(401)
})

test('the last active owner cannot be reassigned to a custom role', async () => {
  const owner = await signIn('owner')
  const role = ok(await owner.api.roles.post({ name: 'Custom', permissions: [] }))
  const result = await owner.api.users({ id: owner.user.id }).patch({ roleId: role.id })
  expect(result.status).toBe(409)
  expect(result.error?.value).toMatchObject({ code: 'LAST_OWNER' })
})

test('users.manage can list roles for assigning users but cannot mutate roles', async () => {
  const owner = await signIn('owner')
  const role = ok(await owner.api.roles.post({ name: 'Staff admin', permissions: ['users.manage'] }))
  const admin = await signInWithRole('admin', role.id)
  expect((await admin.api.roles.get({ query: {} })).status).toBe(200)
  expect((await admin.api.users.get()).status).toBe(200)
  expect((await admin.api.roles.post({ name: 'No', permissions: [] })).status).toBe(403)
})

test('branches.switch grants branch visibility and branch selection independently of branch management', async () => {
  const owner = await signIn('owner')
  const branch = await seedBranch()
  const role = ok(await owner.api.roles.post({ name: 'Roaming staff', permissions: ['branches.switch'] }))
  const roaming = await signInWithRole('roaming', role.id, { workingBranchId: branch.id })
  expect(ok(await roaming.api.branches.get()).items.map((item) => item.id)).toEqual([branch.id, 1])
  expect((await roaming.api.catalog.products.get({ query: {} })).status).toBe(200)
  expect((await roaming.api.branches.post({ code: 'NO', name: 'No' })).status).toBe(403)
})
