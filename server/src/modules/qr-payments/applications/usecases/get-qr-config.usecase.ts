import { inject, injectable } from 'tsyringe'
import { qrPaymentGatewayToken } from '../ports/qr-payment-gateway.port'
import type { IQrPaymentGateway } from '../ports/qr-payment-gateway.port'

/** Query: whether the shop has set up QR payments with the bank, so the till knows to offer them. */
@injectable()
export class GetQrConfigUseCase {
  constructor(@inject(qrPaymentGatewayToken) private readonly gateway: IQrPaymentGateway) {}

  execute() {
    return { enabled: this.gateway.isEnabled() }
  }
}
