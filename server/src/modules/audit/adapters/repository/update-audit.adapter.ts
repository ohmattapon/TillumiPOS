import { inject, injectable } from 'tsyringe'
import type { AuditEntry } from '../../../../domains/audit-entry.vo'
import {
  type IUpdateAudit,
} from '../../../update/applications/ports/update-audit.port'
import { auditLogToken, type IAuditLog } from '../../applications/ports/audit-log.port'

/** Answers the update module's audit port through the append-only audit log. */
@injectable()
export class AuditUpdateAudit implements IUpdateAudit {
  constructor(@inject(auditLogToken) private readonly log: IAuditLog) {}

  recordUpdate(actor: { id: number | null; name: string }, entry: AuditEntry): Promise<void> {
    // Updates are shop-wide, so they are recorded without a branch.
    return this.log.record(actor, null, entry)
  }
}
