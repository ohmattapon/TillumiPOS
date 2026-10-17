import { beforeEach, describe, expect, test } from 'bun:test'
import { container } from 'tsyringe'
import { buildAuditEntry } from '../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../modules/audit/applications/ports/audit-log.port'
import { baseUrl, ok, resetDatabase, signIn } from '../../../test/harness'

beforeEach(() => resetDatabase())

describe('audit history', () => {
  test('an owner reads new records first, filters action, and never receives credentials', async () => {
    const owner = await signIn('owner')
    const audit = container.resolve<IAuditLog>(auditLogToken)
    for (const [entityId, action] of [['1', 'product.create'], ['2', 'product.update']])
      await audit.record({ id: owner.user.id, name: owner.user.displayName }, 1, buildAuditEntry({
        action: action!, entityType: 'product', entityId: entityId!, summary: 'แก้ไขสินค้า',
        before: { password: 'never-store', token: 'never-store', name: 'เก่า' }, after: { name: 'ใหม่' },
      }))
    const result = ok(await owner.api['audit-logs'].get({ query: { entityType: 'product' } }))
    expect(result.total).toBe(2)
    expect(result.items.map((row) => row.entityId)).toEqual(['2', '1'])
    expect(result.items[0]?.before).toEqual({ name: 'เก่า' })
    expect(JSON.stringify(result)).not.toContain('never-store')
    const filtered = ok(await owner.api['audit-logs'].get({ query: { action: 'product.create' } }))
    expect(filtered.items.map((row) => row.entityId)).toEqual(['1'])
    const page = ok(await owner.api['audit-logs'].get({ query: { entityType: 'product', limit: 1, offset: 1 } }))
    expect(page.total).toBe(2)
    expect(page.items.map((row) => row.entityId)).toEqual(['1'])
  })
  test('a cashier cannot read audit history', async () => {
    const cashier = await signIn('cashier')
    expect((await cashier.api['audit-logs'].get({ query: {} })).status).toBe(403)
  })
  test('no route can edit or remove audit records', async () => {
    for (const method of ['PATCH', 'PUT', 'DELETE'])
      expect((await fetch(`${baseUrl}/audit-logs/1`, { method, headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(404)
  })
})
