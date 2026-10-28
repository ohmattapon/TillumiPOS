import { inject, injectable } from 'tsyringe'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import {
  type IPrintAudit,
  type PrintAuditEntry,
} from '../../../receipt-printer/applications/ports/print-audit.port'
import { auditLogToken } from '../../applications/ports/audit-log.port'
import type { IAuditLog } from '../../applications/ports/audit-log.port'

const summaries: Record<PrintAuditEntry['action'], (entry: PrintAuditEntry) => string> = {
  'receipt.printed': (entry) => `พิมพ์ใบเสร็จขาย #${entry.saleId} (${entry.sentBytes} ไบต์)`,
  'receipt.print_failed': (entry) => `พิมพ์ใบเสร็จขาย #${entry.saleId} ไม่สำเร็จ`,
  'receipt.drawer_opened': () => 'เปิดลิ้นชักด้วยมือ',
  'receipt.drawer_failed': () => 'เปิดลิ้นชักด้วยมือไม่สำเร็จ',
}

/**
 * Appends the print trail to the audit log. Provider side: the port is owned by receipt-printer,
 * implemented and bound here. The printer's address never enters the log.
 */
@injectable()
export class AuditPrintAudit implements IPrintAudit {
  constructor(@inject(auditLogToken) private readonly audit: IAuditLog) {}

  async record(actor: { id: number; displayName: string }, branchId: number, entry: PrintAuditEntry): Promise<void> {
    await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({
      action: entry.action,
      entityType: 'receipt-print',
      entityId: entry.ref,
      summary: summaries[entry.action](entry),
      after: {
        saleId: entry.saleId,
        sentBytes: entry.sentBytes,
        ...(entry.errorCode && { errorCode: entry.errorCode }),
      },
    }))
  }
}
