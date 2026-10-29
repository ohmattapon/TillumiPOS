import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { buildQrReference } from '../../../../domains/qr-payment.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IIdGenerator } from '../../../shared/ports/id-generator.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { quoteClaimsToken, type IQuoteClaims } from '../../../quotes/applications/ports/quote-claims.port'
import { TOKENS } from '../../../tokens'
import { qrPaymentGatewayToken } from '../ports/qr-payment-gateway.port'
import type { IQrPaymentGateway } from '../ports/qr-payment-gateway.port'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'
import { createQrPaymentSchema } from '../schemas/qr-payment-schemas'

/** How long a QR is shown for. The bank sets no expiry; this only stops waiting and polling. */
export const QR_VALID_FOR_MS = 10 * 60 * 1000

/** Command: asks the bank for a QR for an exact amount and keeps track of it until it is paid. */
@injectable()
export class CreateQrPaymentUseCase {
  constructor(
    @inject(qrPaymentGatewayToken) private readonly gateway: IQrPaymentGateway,
    @inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository,
    @inject(TOKENS.Clock) private readonly clock: IClock,
    @inject(quoteClaimsToken) private readonly quotes: IQuoteClaims,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.IdGenerator) private readonly ids: IIdGenerator,
  ) {}

  async execute(input: unknown, actor: { userId: number; branch: { id: number; code: string } }) {
    const dto = createQrPaymentSchema.parse(input)
    if (!this.gateway.isEnabled())
      throw new DomainConflictError('ร้านนี้ยังไม่ได้ตั้งค่าการรับชำระด้วย QR', 'QR_NOT_CONFIGURED')

    // Reference 1: every QR reference in the system is built by one function (KBank takes at most 15).
    const reference = buildQrReference(this.ids.newId())
    // A QR made from a pinned price holds that quote first, so the price cannot move while the customer pays.
    if (dto.quoteId !== undefined) {
      const quoteId = dto.quoteId
      await this.unitOfWork.run(() =>
        this.quotes.reserveForQr(quoteId, { branchId: actor.branch.id, reference, amountSatang: dto.amountSatang }),
      )
    }

    const qr = await this.askBank(reference, dto, actor.branch.code)

    const payment = await this.payments.create({
      branchId: actor.branch.id,
      reference,
      amountSatang: dto.amountSatang,
      qrRawData: qr.qrRawData,
      expiresAt: new Date(this.clock.now().getTime() + QR_VALID_FOR_MS),
      createdById: actor.userId,
      originShiftId: null,
    })
    return { payment, qrImage: qr.qrImage }
  }

  private async askBank(reference: string, dto: { amountSatang: number; quoteId?: number }, branchCode: string) {
    try {
      return await this.gateway.createQr({ reference, amountSatang: dto.amountSatang, branchCode })
    } catch (error) {
      // No QR was made, so nobody can pay: the quote goes back to being open.
      if (dto.quoteId !== undefined) await this.unitOfWork.run(() => this.quotes.releaseByReference(reference))
      throw error
    }
  }
}
