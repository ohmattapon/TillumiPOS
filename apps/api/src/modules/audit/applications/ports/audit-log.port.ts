import type { AuditEntry } from '../../../../domains/audit-entry.vo'
import type { Page } from '../../../../domains/page'

export interface AuditActor { id: number | null; name: string }
/** Inclusive shop-calendar dates; the adapter resolves boundaries in timeZone. */
export interface AuditFilter {
  from?: string
  to?: string
  timeZone: string
  actorId?: number
  action?: string
  entityType?: string
  entityId?: string
}
export type AuditRecord = AuditEntry & { id: number; at: Date; actorId: number | null; actorName: string; branchId: number | null }
export interface IAuditLog {
  record(actor: AuditActor, branchId: number | null, entry: AuditEntry): Promise<void>
  list(filter: AuditFilter, page: { limit: number; offset: number }): Promise<Page<AuditRecord>>
}
const token: unique symbol = Symbol('IAuditLog')
export const auditLogToken = token.toString()
