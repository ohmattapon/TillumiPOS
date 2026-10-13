import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { QrPaymentEntity } from '../../../../domains/qr-payment.domain'
import { qrPaymentGatewayToken } from '../ports/qr-payment-gateway.port'
import type { IQrPaymentGateway } from '../ports/qr-payment-gateway.port'
import type { IQrPaymentClaims } from '../ports/qr-payment-claims.port'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'

@injectable()
export class QrPaymentClaims implements IQrPaymentClaims {
  constructor(
    @inject(qrPaymentGatewayToken) private readonly gateway: IQrPaymentGateway,
    @inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository,
  ) {}

  isRequired() {
    return this.gateway.isEnabled()
  }

  async assertClaimable(qrPaymentId: number, { branchId, amountSatang }: { branchId: number; amountSatang: number }) {
    const payment = await this.find(qrPaymentId)
    // Another branch's payment is not even acknowledged to exist.
    if (payment.branchId !== branchId) throw notFound()
    payment.assertClaimable(amountSatang)
  }

  async consume(qrPaymentId: number, saleId: number) {
    await this.payments.save((await this.find(qrPaymentId)).consume(saleId))
  }

  private async find(id: number): Promise<QrPaymentEntity> {
    const payment = await this.payments.findByIdForUpdate(id)
    if (!payment) throw notFound()
    return payment
  }
}

const notFound = () => new DomainNotFoundError('ไม่พบรายการชำระด้วย QR', 'QR_PAYMENT_NOT_FOUND')
