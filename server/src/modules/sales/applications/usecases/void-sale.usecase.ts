import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { stockLedgerToken } from '../../../inventory/applications/ports/stock-ledger.port'
import type { IStockLedger } from '../../../inventory/applications/ports/stock-ledger.port'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { saleRepositoryToken } from '../ports/sale.repository'
import type { ISaleRepository } from '../ports/sale.repository'
import { voidSaleSchema } from '../schemas/sale-schemas'

/** Command: voids a sale and puts its stock back. The sale itself is kept, never deleted. */
@injectable()
export class VoidSaleUseCase {
  constructor(
    @inject(saleRepositoryToken) private readonly sales: ISaleRepository,
    @inject(stockLedgerToken) private readonly ledger: IStockLedger,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }

  async execute(id: number, input: unknown, user: Actor & { id: number; displayName: string }, branchId: number) {
    const { reason } = voidSaleSchema.parse(input)
    requirePermission(user, 'sales.void')

    return this.unitOfWork.run(async () => {
      // Locked so two requests cannot both void the sale and return its stock twice.
      const sale = await this.sales.findByIdForUpdate(id)
      if (!sale || sale.branchId !== branchId) throw new DomainNotFoundError('ไม่พบบิลขาย')

      const voided = sale.void(reason, user.id, this.clock.now())
      await this.sales.saveVoid(voided)

      // By product id, the same order sales lock products in, so a void cannot deadlock with a sale.
      const items = [...voided.items].sort((a, b) => a.productId - b.productId)
      for (const item of items)
        await this.ledger.record({
          branchId: sale.branchId,
          productId: item.productId,
          type: 'void',
          // A pack line returns the pieces it held.
          quantity: item.quantity * item.packSize,
          reference: voided.receiptNo,
          note: reason,
          userId: user.id,
        })

      await this.audit.record({ id: user.id, name: user.displayName }, branchId, buildAuditEntry({
        action: 'sale.void',
        entityType: 'sale',
        entityId: String(id),
        summary: 'ยกเลิกบิลขาย',
        before: { status: sale.status },
        after: { status: voided.status },
        reason,
      }))
      return voided
    })
  }
}
