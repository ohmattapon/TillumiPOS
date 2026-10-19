import { inject, injectable } from 'tsyringe'
import { buildAuditEntry, type AuditEntry } from '../../../domains/audit-entry.vo'
import type { IClock } from '../../shared/ports/clock.port'
import { TOKENS } from '../../tokens'
import type {
  AuditActor,
  AuditFilter,
  AuditRecord,
  IAuditLog,
} from '../../audit/applications/ports/audit-log.port'

/**
 * No-database audit log: append-only array, newest first on read.
 * Timestamps come through IClock so tests can pin time; secret stripping and
 * the JSON size limit are shared with the drizzle twin via buildAuditEntry.
 */
@injectable()
export class MemoryAuditLog implements IAuditLog {
  private readonly records: AuditRecord[] = []
  private nextId = 1

  constructor(@inject(TOKENS.Clock) private readonly clock: IClock) {}

  async record(actor: AuditActor, branchId: number | null, entry: AuditEntry): Promise<void> {
    this.records.push({
      ...buildAuditEntry(entry),
      id: this.nextId++,
      at: this.clock.now(),
      actorId: actor.id,
      actorName: actor.name,
      branchId,
    })
  }

  async list(filter: AuditFilter, page: { limit: number; offset: number }) {
    // Shop-calendar days like the drizzle twin; en-CA formats as YYYY-MM-DD.
    const dayOf = new Intl.DateTimeFormat('en-CA', {
      timeZone: filter.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const items = this.records
      .filter(
        (record) =>
          (filter.actorId === undefined || record.actorId === filter.actorId) &&
          (!filter.action || record.action === filter.action) &&
          (!filter.entityType || record.entityType === filter.entityType) &&
          (!filter.entityId || record.entityId === filter.entityId) &&
          (!filter.from || dayOf.format(record.at) >= filter.from) &&
          (!filter.to || dayOf.format(record.at) <= filter.to),
      )
      .sort((a, b) => b.at.getTime() - a.at.getTime() || b.id - a.id)
    return { items: items.slice(page.offset, page.offset + page.limit), total: items.length }
  }
}
