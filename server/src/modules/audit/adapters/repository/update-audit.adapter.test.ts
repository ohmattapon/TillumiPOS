import { describe, expect, test } from 'bun:test'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { mockAuditLog } from '../../../../__tests__/mocks'
import { AuditUpdateAudit } from './update-audit.adapter'

describe('AuditUpdateAudit', () => {
  test('forwards the entry to the append-only log without a branch', async () => {
    const log = mockAuditLog()
    const entry = buildAuditEntry({
      action: 'update.applied',
      entityType: 'update',
      entityId: '9.9.9',
      summary: 'เตรียมอัปเดตโปรแกรมรุ่น 9.9.9',
      after: { version: '9.9.9' },
    })

    await new AuditUpdateAudit(log).recordUpdate({ id: 1, name: 'เจ้าของ' }, entry)

    expect(log.record).toHaveBeenCalledTimes(1)
    expect(log.record).toHaveBeenCalledWith({ id: 1, name: 'เจ้าของ' }, null, entry)
  })
})
