import { inject, injectable } from 'tsyringe'
import { z } from 'zod'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { saleRepositoryToken } from '../ports/sale.repository'
import type { ISaleRepository } from '../ports/sale.repository'
import { TOKENS } from '../../../tokens'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IShiftLedger } from '../../../shared/ports/shift-ledger.port'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'

const refundSchema = z.object({ shiftId: z.number().int().positive(), reason: z.string().trim().min(1).max(500) })
interface Actor { id: number; displayName: string }

/** Command: records the full cash portion of a voided sale as a one-time outflow from an open shift. */
@injectable()
export class RecordCashRefundUseCase {
  constructor(
    @inject(saleRepositoryToken) private readonly sales: ISaleRepository,
    @inject(TOKENS.ShiftLedger) private readonly shiftLedger: IShiftLedger,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
    @inject(TOKENS.Idempotency) private readonly idempotency: CommandIdempotency,
  ) {}

  execute(saleId: number, input: unknown, actor: Actor, branchId: number, key: string) {
    const dto = refundSchema.parse(input)
    return this.unitOfWork.run(() => this.idempotency.execute(
      { actorId: actor.id, branchId, action: 'sales.cash-refund', key },
      { saleId, ...dto },
      async () => {
        const sale = await this.sales.findByIdForUpdate(saleId)
        if (!sale || sale.branchId !== branchId) throw new DomainNotFoundError('ไม่พบบิลขาย', 'SALE_NOT_FOUND')
        if (sale.status !== 'voided') throw new DomainConflictError('ต้องยกเลิกบิลก่อนคืนเงินสด', 'SALE_NOT_VOIDED')
        const amountSatang = Math.max(0, sale.payments.filter((payment) => payment.method === 'cash').reduce((sum, payment) => sum + payment.amountSatang, 0) - sale.changeSatang)
        if (amountSatang <= 0) throw new DomainConflictError('บิลนี้ไม่มีเงินสดที่ต้องคืน', 'SALE_HAS_NO_CASH_REFUND')
        await this.shiftLedger.recordSaleRefund({
          shiftId: dto.shiftId, branchId, saleId, actorId: actor.id, actorName: actor.displayName,
          amountSatang, reason: dto.reason, createdAt: this.clock.now(),
        })
        return { shiftId: dto.shiftId, saleId, amountSatang }
      },
      (result) => result,
      async (snapshot) => snapshot as { shiftId: number; saleId: number; amountSatang: number },
    ))
  }
}
