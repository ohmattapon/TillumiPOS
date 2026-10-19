import 'reflect-metadata'
import { describe, expect, test } from 'bun:test'
import { buildAuditEntry } from '../../../domains/audit-entry.vo'
import { MemoryAuditLog } from './audit-log.memory'
import { MemoryCommandReceipts } from './command-receipts.memory'
import { MemoryUnitOfWork } from './unit-of-work.memory'
import type { CommandScope } from '../../shared/ports/command-receipts.port'

const scope: CommandScope = { actorId: 1, branchId: 1, action: 'sale.void', key: 'k1' }

describe('MemoryUnitOfWork', () => {
  test('runs the work directly and returns its result', async () => {
    const uow = new MemoryUnitOfWork()
    await expect(uow.run(async () => 42)).resolves.toBe(42)
  })

  test('lets a rejection through without wrapping it', async () => {
    const uow = new MemoryUnitOfWork()
    await expect(uow.run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
  })
})

describe('MemoryCommandReceipts', () => {
  test('finds nothing before anything is created', async () => {
    await expect(new MemoryCommandReceipts().find(scope)).resolves.toBeNull()
  })

  test('lock resolves without doing anything', async () => {
    await expect(new MemoryCommandReceipts().lock(scope)).resolves.toBeUndefined()
  })

  test('returns the stored hash and result for the same scope', async () => {
    const receipts = new MemoryCommandReceipts()
    await receipts.lock(scope)
    await receipts.create(scope, 'hash-a', { saleId: 7 })
    expect(await receipts.find(scope)).toEqual({ requestHash: 'hash-a', result: { saleId: 7 } })
  })

  test('keeps receipts apart by actor, branch, action and key', async () => {
    const receipts = new MemoryCommandReceipts()
    await receipts.create(scope, 'hash-a', 'first')
    const others: CommandScope[] = [
      { ...scope, actorId: 2 },
      { ...scope, branchId: 2 },
      { ...scope, action: 'sale.checkout' },
      { ...scope, key: 'k2' },
    ]
    for (const other of others) await expect(receipts.find(other)).resolves.toBeNull()
    expect(await receipts.find(scope)).toEqual({ requestHash: 'hash-a', result: 'first' })
  })
})

describe('MemoryAuditLog', () => {
  const clock = (iso: string) => ({ now: () => new Date(iso) })

  test('records an entry with id, clock time, actor and branch', async () => {
    const log = new MemoryAuditLog(clock('2026-10-19T10:00:00+07:00'))
    await log.record({ id: 1, name: 'admin' }, 1, buildAuditEntry({
      action: 'sale.void',
      entityType: 'sale',
      entityId: '12',
      summary: 'ยกเลิกบิล 12',
    }))
    const { items, total } = await log.list({ timeZone: 'Asia/Bangkok' }, { limit: 50, offset: 0 })
    expect(total).toBe(1)
    expect(items[0]).toMatchObject({
      id: 1,
      at: new Date('2026-10-19T10:00:00+07:00'),
      actorId: 1,
      actorName: 'admin',
      branchId: 1,
      action: 'sale.void',
      entityType: 'sale',
      entityId: '12',
      summary: 'ยกเลิกบิล 12',
    })
  })

  test('strips secret fields like the drizzle twin', async () => {
    const log = new MemoryAuditLog(clock('2026-10-19T10:00:00+07:00'))
    await log.record({ id: null, name: 'system' }, null, buildAuditEntry({
      action: 'user.create',
      entityType: 'user',
      entityId: '3',
      summary: 'สร้างผู้ใช้',
      after: { username: 'ploy', password: 'hunter2' },
    }))
    const { items } = await log.list({ timeZone: 'Asia/Bangkok' }, { limit: 50, offset: 0 })
    expect(items[0]?.after).toEqual({ username: 'ploy' })
  })

  test('lists newest first and pages with a total', async () => {
    const log = new MemoryAuditLog(clock('2026-10-19T10:00:00+07:00'))
    for (let n = 1; n <= 3; n++) {
      await log.record({ id: n, name: `u${n}` }, 1, buildAuditEntry({
        action: 'sale.void',
        entityType: 'sale',
        entityId: String(n),
        summary: `บิล ${n}`,
      }))
    }
    const first = await log.list({ timeZone: 'Asia/Bangkok' }, { limit: 2, offset: 0 })
    expect(first.total).toBe(3)
    expect(first.items.map((item) => item.entityId)).toEqual(['3', '2'])
    const second = await log.list({ timeZone: 'Asia/Bangkok' }, { limit: 2, offset: 2 })
    expect(second.items.map((item) => item.entityId)).toEqual(['1'])
  })

  test('filters by actor, action, entity and shop-calendar days', async () => {
    let now = '2026-10-18T23:00:00Z'
    const log = new MemoryAuditLog({ now: () => new Date(now) })
    await log.record({ id: 1, name: 'admin' }, 1, buildAuditEntry({
      action: 'sale.void', entityType: 'sale', entityId: '1', summary: 'a',
    }))
    now = '2026-10-19T10:00:00Z'
    await log.record({ id: 2, name: 'ploy' }, 1, buildAuditEntry({
      action: 'user.create', entityType: 'user', entityId: '2', summary: 'b',
    }))

    expect((await log.list({ timeZone: 'Asia/Bangkok', actorId: 2 }, { limit: 50, offset: 0 })).total).toBe(1)
    expect((await log.list({ timeZone: 'Asia/Bangkok', action: 'sale.void' }, { limit: 50, offset: 0 })).total).toBe(1)
    expect((await log.list({ timeZone: 'Asia/Bangkok', entityType: 'user', entityId: '2' }, { limit: 50, offset: 0 })).total).toBe(1)
    // 2026-10-18T23:00Z is already 2026-10-19 in Bangkok; both rows share that shop day.
    expect((await log.list({ timeZone: 'Asia/Bangkok', from: '2026-10-19', to: '2026-10-19' }, { limit: 50, offset: 0 })).total).toBe(2)
    expect((await log.list({ timeZone: 'Asia/Bangkok', from: '2026-10-20' }, { limit: 50, offset: 0 })).total).toBe(0)
  })
})
