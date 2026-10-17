import 'reflect-metadata'
import { describe, expect, mock, test } from 'bun:test'
import { ShopSettingsEntity, DEFAULT_SHOP_SETTINGS } from '../../../../domains/shop-settings.domain'
import { ListAuditLogsUseCase } from './list-audit-logs.usecase'
import type { IAuditLog } from '../ports/audit-log.port'

const setup = () => {
  const result = { items: [], total: 0 }
  const audit: IAuditLog = { record: mock(async () => {}), list: mock(async () => result) }
  const settings = { get: mock(async () => new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS)), getForUpdate: mock(), save: mock() }
  return { audit, settings, result, query: new ListAuditLogsUseCase(audit, settings) }
}

describe('ListAuditLogsUseCase', () => {
  test('uses shop calendar dates with inclusive end day, default page, and returns the port result', async () => {
    const { query, audit, result } = setup()
    expect(await query.execute({ from: '2026-10-16', to: '2026-10-16', action: 'sale.void' }, { role: 'owner' })).toBe(result)
    expect(audit.list).toHaveBeenCalledWith({ from: '2026-10-16', to: '2026-10-16', action: 'sale.void', timeZone: 'Asia/Bangkok' }, { limit: 50, offset: 0 })
  })
  test('allows a custom role to read its permitted audit records', async () => {
    const { query, audit } = setup()
    await query.execute({ limit: 10, offset: 20, actorId: 4, entityType: 'sale', entityId: '12' }, { role: 'cashier', permissions: ['audit.read'] })
    expect(audit.list).toHaveBeenCalledWith({ actorId: 4, entityType: 'sale', entityId: '12', timeZone: 'Asia/Bangkok' }, { limit: 10, offset: 20 })
  })
  test('denies audit access before querying records', async () => {
    const { query, audit } = setup()
    await expect(query.execute({}, { role: 'cashier' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED', params: { permission: 'audit.read' } })
    expect(audit.list).not.toHaveBeenCalled()
  })
  test.each([{ limit: 201 }, { offset: -1 }, { from: '2026-02-30' }, { actorId: 0 }])('rejects malformed filters %p', async (input) => {
    const { query, audit } = setup()
    await expect(query.execute(input, { role: 'owner' })).rejects.toThrow()
    expect(audit.list).not.toHaveBeenCalled()
  })
  test('rejects reversed dates with INVALID_RANGE', async () => {
    const { query, audit } = setup()
    await expect(query.execute({ from: '2026-10-17', to: '2026-10-16' }, { role: 'owner' })).rejects.toMatchObject({ code: 'INVALID_RANGE' })
    expect(audit.list).not.toHaveBeenCalled()
  })
})
