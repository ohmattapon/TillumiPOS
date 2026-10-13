import { container } from 'tsyringe'
import { ScbQrGateway } from './adapters/gateway/scb-qr.gateway'
import { QrPaymentElysiaController } from './adapters/controllers/qr-payment.controller'
import { DrizzleQrPaymentRepository } from './adapters/repository/qr-payment.drizzle.repository'
import { qrPaymentClaimsToken } from './applications/ports/qr-payment-claims.port'
import { qrPaymentGatewayToken } from './applications/ports/qr-payment-gateway.port'
import { qrPaymentRepositoryToken } from './applications/ports/qr-payment.repository'
import { QrPaymentClaims } from './applications/services/qr-payment-claims'
import { QrPaymentRefresher } from './applications/services/qr-payment-refresher'
import { CancelQrPaymentUseCase } from './applications/usecases/cancel-qr-payment.usecase'
import { ConfirmScbCallbackUseCase } from './applications/usecases/confirm-scb-callback.usecase'
import { CreateQrPaymentUseCase } from './applications/usecases/create-qr-payment.usecase'
import { GetQrPaymentUseCase } from './applications/usecases/get-qr-payment.usecase'

container.register(qrPaymentRepositoryToken, { useClass: DrizzleQrPaymentRepository })
// One instance: it keeps the bank's access token between calls.
container.registerSingleton(qrPaymentGatewayToken, ScbQrGateway)
container.register(qrPaymentClaimsToken, { useClass: QrPaymentClaims })
container.registerSingleton(QrPaymentRefresher)
container.registerSingleton(CreateQrPaymentUseCase)
container.registerSingleton(GetQrPaymentUseCase)
container.registerSingleton(CancelQrPaymentUseCase)
container.registerSingleton(ConfirmScbCallbackUseCase)
container.registerSingleton(QrPaymentElysiaController)
