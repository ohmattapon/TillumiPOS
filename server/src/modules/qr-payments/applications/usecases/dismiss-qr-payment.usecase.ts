import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { quoteClaimsToken, type IQuoteClaims } from '../../../quotes/applications/ports/quote-claims.port'
import { TOKENS } from '../../../tokens'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'
import { dismissQrPaymentSchema } from '../schemas/qr-payment-schemas'

/**
 * Command (owner): records that a paid QR will never get a sale here, with the reason, for example
 * because the money was returned at the bank. Without this a payment that cannot be sold against
 * would keep its shift from ever being counted. The payment stays on record as paid.
 */
@injectable()
export class DismissQrPaymentUseCase {
  constructor(
    @inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
    @inject(quoteClaimsToken) private readonly quotes: IQuoteClaims,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }

  async execute(id: number, input: unknown, actor: Actor & { id: number; displayName: string }, branchId: number) {
    const { reason } = dismissQrPaymentSchema.parse(input)
    requirePermission(actor, 'qr.dismiss')

    return this.unitOfWork.run(async () => {
      const payment = await this.payments.findByIdForUpdate(id)
      if (!payment || payment.branchId !== branchId)
        throw new DomainNotFoundError('ไม่พบรายการชำระด้วย QR', 'QR_PAYMENT_NOT_FOUND')
      const dismissed = await this.payments.save(payment.dismiss(reason, actor.id, this.clock.now()))
      // The money will never be billed here, so the price it held is closed with it.
      await this.quotes.cancelByReference(dismissed.reference)
      await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({
        action: 'qr.dismiss',
        entityType: 'qr',
        entityId: String(id),
        summary: 'ปิดรายการเงินจาก QR',
        before: { status: payment.status },
        after: { status: dismissed.status, dismissed: true },
        reason,
      }))
      return dismissed
    })
  }
}
