import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { voidEarnPoints } from '../../../../domains/member-points'
import { stockLedgerToken } from '../../../inventory/applications/ports/stock-ledger.port'
import type { IStockLedger } from '../../../inventory/applications/ports/stock-ledger.port'
import { checkoutPointsToken } from '../ports/checkout-points.port'
import type { ICheckoutPoints } from '../ports/checkout-points.port'
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
    @inject(checkoutPointsToken) private readonly points: ICheckoutPoints,
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

      await this.movePoints(sale, reason, user, branchId)

      // By product id, the same order sales lock products in, so a void cannot deadlock with a sale.
      const items = [...voided.items].sort((a, b) => a.productId - b.productId)
      for (const item of items)
        await this.ledger.record({
          branchId: sale.branchId,
          productId: item.productId,
          type: 'void',
          // A pack line returns its pieces.
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

  /**
   * Redeemed points come back before earned points are clawed back, so a member who
   * already spent what the bill gave keeps as much as the ledger can honestly return.
   */
  private async movePoints(
    sale: { id: number; member: { id: number } | null; pointsEarned: number; pointsRedeemed: number },
    reason: string,
    user: { id: number; displayName: string },
    branchId: number,
  ) {
    if (!sale.member || (sale.pointsEarned === 0 && sale.pointsRedeemed === 0)) return
    const memberId = sale.member.id
    await this.points.lockMember(memberId)

    if (sale.pointsRedeemed > 0)
      await this.points.record({
        memberId, kind: 'void_redeem', points: sale.pointsRedeemed, saleId: sale.id, quoteId: null, reason, actorId: user.id,
      })

    let returned = 0
    if (sale.pointsEarned > 0) {
      const balance = await this.points.balanceOf(memberId)
      const takeBack = voidEarnPoints(sale.pointsEarned, balance)
      returned = takeBack.points
      // A zero here would only repeat what the shortfall says, and the ledger refuses a zero movement.
      if (takeBack.points !== 0)
        await this.points.record({
          memberId,
          kind: 'void_earn',
          points: takeBack.points,
          saleId: sale.id,
          quoteId: null,
          reason: takeBack.shortfall > 0 ? `คืนแต้มได้ไม่ครบ ขาด ${takeBack.shortfall} แต้ม` : null,
          actorId: user.id,
        })
    }

    await this.audit.record({ id: user.id, name: user.displayName }, branchId, buildAuditEntry({
      action: 'member.points_voided',
      entityType: 'member',
      entityId: String(memberId),
      summary: 'ปรับแต้มจากการยกเลิกบิล',
      after: { saleId: sale.id, returnedPoints: sale.pointsRedeemed, removedPoints: -returned },
      reason,
    }))
  }
}
