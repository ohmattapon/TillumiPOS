export interface PrintAuditEntry {
  action: 'receipt.printed' | 'receipt.print_failed' | 'receipt.drawer_opened' | 'receipt.drawer_failed'
  /** The idempotency key for prints; 'manual' for a hand-opened drawer. */
  ref: string
  /** The bill the receipt was printed for; null for a hand-opened drawer. Printing never reads the bill. */
  saleId: number | null
  sentBytes: number
  /** The domain error code of a failed print or kick, if it had one. */
  errorCode?: string
}

/**
 * The print trail. Owned here, answered by the audit module. Narrow on purpose: printing needs
 * to append history, never to read or change it, and the printer's address is never recorded.
 */
export interface IPrintAudit {
  record(actor: { id: number; displayName: string }, branchId: number, entry: PrintAuditEntry): Promise<void>
}

const printAuditTokenSymbol: unique symbol = Symbol('IPrintAudit')
export const printAuditToken = printAuditTokenSymbol.toString()
