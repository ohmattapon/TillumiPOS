import { and, count, desc, eq, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { buildAuditEntry, type AuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogs } from '../../../../infrastructure/database/schema/audit-logs'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { AuditActor, AuditFilter, AuditRecord, IAuditLog } from '../../applications/ports/audit-log.port'

/** No update/delete path: records join the command's current transaction. */
@injectable()
export class DrizzleAuditLogRepository implements IAuditLog {
  async record(actor: AuditActor, branchId: number | null, entry: AuditEntry): Promise<void> {
    await currentExecutor().insert(auditLogs).values({ ...buildAuditEntry(entry), actorId: actor.id, actorName: actor.name, branchId })
  }

  async list(filter: AuditFilter, page: { limit: number; offset: number }) {
    const where = and(
      // Match sales reports: each endpoint includes the complete final local day, even across DST.
      filter.from ? sql`${auditLogs.at} >= (${filter.from}::date::timestamp at time zone ${filter.timeZone})` : undefined,
      filter.to ? sql`${auditLogs.at} < ((${filter.to}::date + 1)::timestamp at time zone ${filter.timeZone})` : undefined,
      filter.actorId !== undefined ? eq(auditLogs.actorId, filter.actorId) : undefined,
      filter.action ? eq(auditLogs.action, filter.action) : undefined,
      filter.entityType ? eq(auditLogs.entityType, filter.entityType) : undefined,
      filter.entityId ? eq(auditLogs.entityId, filter.entityId) : undefined,
    )
    const executor = currentExecutor()
    const items = await executor.select().from(auditLogs).where(where).orderBy(desc(auditLogs.at), desc(auditLogs.id)).limit(page.limit).offset(page.offset)
    const [row] = await executor.select({ total: count() }).from(auditLogs).where(where)
    return { items: items as AuditRecord[], total: row?.total ?? 0 }
  }
}
