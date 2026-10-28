import { beforeEach, expect, test } from 'bun:test'
import { container } from 'tsyringe'
import { buildAuditEntry } from '../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../modules/audit/applications/ports/audit-log.port'
import { productRepositoryToken, type IProductRepository } from '../../modules/products/applications/ports/product.repository'
import { CreateProductUseCase } from '../../modules/products/applications/usecases/create-product.usecase'
import { TOKENS } from '../../modules/tokens'
import type { IUnitOfWork } from '../../modules/shared/ports/unit-of-work.port'
import { baseUrl, ok, resetDatabase, seedProduct, signIn } from '../../../test/harness'

beforeEach(() => resetDatabase())

test('void history identifies the authenticated operator and the original status', async () => {
  const owner = await signIn('owner'), product = await seedProduct(owner, { stock: 2 })
  const sale = ok(await owner.api.sales.post({ items: [{ productId: product.id, quantity: 1 }], payments: [{ method: 'cash', amountSatang: product.priceSatang }] }))
  ok(await owner.api.sales({ id: sale.id }).void.post({ reason: 'คิดเงินผิด' }))
  const history = ok(await owner.api['audit-logs'].get({ query: { action: 'sale.void' } }))
  expect(history.total).toBe(1)
  expect(history.items[0]).toMatchObject({ actorId: owner.user.id, actorName: owner.user.displayName, branchId: 1, entityId: String(sale.id), before: { status: 'completed' }, after: { status: 'voided' }, reason: 'คิดเงินผิด' })
})

test('invalid inventory adjustment creates no audit record', async () => {
  const owner = await signIn('owner'), product = await seedProduct(owner, { stock: 2 })
  const before = ok(await owner.api['audit-logs'].get({ query: { action: 'stock.adjust' } })).total
  expect((await owner.api.inventory.adjust.post({ productId: product.id, countedQty: -1 })).status).toBe(422)
  expect(ok(await owner.api['audit-logs'].get({ query: { action: 'stock.adjust' } })).total).toBe(before)
})

test('a password change stores only a boolean marker, and failed login stores no credential', async () => {
  const owner = await signIn('owner'), password = 'sensitive-audit-password-73'
  const user = ok(await owner.api.users.post({ username: 'audit-user', displayName: 'Audit user', password: 'initial-password', role: 'cashier' }))
  ok(await owner.api.users({ id: user.id }).patch({ password }))
  const changes = ok(await owner.api['audit-logs'].get({ query: { action: 'user.update' } }))
  expect(changes.items[0]?.after).toEqual({ passwordChanged: true })
  expect(JSON.stringify(changes)).not.toContain(password)
  expect(JSON.stringify(changes)).not.toContain('passwordHash')
  expect(JSON.stringify(changes)).not.toContain('$argon2')
  const response = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'audit-user', password: 'wrong-secret' }) })
  expect(response.status).toBe(401)
  const failed = ok(await owner.api['audit-logs'].get({ query: { action: 'auth.login_failed' } }))
  expect(failed.items[0]).toMatchObject({ actorId: null, actorName: 'audit-user', branchId: null })
  expect(JSON.stringify(failed)).not.toContain('wrong-secret')
})

test('audit and business writes roll back together in either failure direction', async () => {
  const owner = await signIn('owner'), audit = container.resolve<IAuditLog>(auditLogToken), uow = container.resolve<IUnitOfWork>(TOKENS.UnitOfWork)
  await expect(uow.run(async () => {
    await audit.record({ id: owner.user.id, name: owner.user.displayName }, 1, buildAuditEntry({ action: 'stock.adjust', entityType: 'product', entityId: 'rollback', summary: 'ต้องถอยพร้อมธุรกรรม' }))
    throw new Error('later command failure')
  })).rejects.toThrow('later command failure')
  expect(ok(await owner.api['audit-logs'].get({ query: { entityId: 'rollback' } })).total).toBe(0)
  const products = container.resolve<IProductRepository>(productRepositoryToken)
  const brokenAudit: IAuditLog = { record: async () => { throw new Error('audit insert failed') }, list: async () => ({ items: [], total: 0 }) }
  const command = new CreateProductUseCase(products, uow, brokenAudit)
  await expect(command.execute({ sku: 'AUDIT-ROLLBACK', name: 'Must roll back', priceSatang: 100 }, 1, owner.user)).rejects.toThrow('audit insert failed')
  expect((await products.findAll({ q: 'AUDIT-ROLLBACK', branchId: 1 })).total).toBe(0)
  await expect(command.execute({ name: 'Auto rollback', priceSatang: 100 }, 1, owner.user)).rejects.toThrow('audit insert failed')
  expect((await products.findAll({ q: 'Auto rollback', branchId: 1 })).total).toBe(0)
  // The failed transaction must release its allocation lock so the next creation works.
  expect(ok(await owner.api.catalog.products.post({ name: 'After rollback', priceSatang: 100 })).sku).toMatch(/^SKU-\d{6,}$/)
})
