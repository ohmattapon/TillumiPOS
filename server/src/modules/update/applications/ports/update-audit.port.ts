import type { AuditEntry } from '../../../../domains/audit-entry.vo'

/**
 * The narrow audit surface this module needs. Owned by the consumer (update),
 * implemented by the audit module — the core never imports another module's
 * ports, so IAuditLog stays behind this boundary. Updates are shop-wide, so
 * the branch the entry is recorded under is always null.
 */
export interface IUpdateAudit {
  recordUpdate(actor: { id: number | null; name: string }, entry: AuditEntry): Promise<void>
}

const updateAuditTokenSymbol: unique symbol = Symbol('IUpdateAudit')
export const updateAuditToken = updateAuditTokenSymbol.toString()
