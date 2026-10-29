import { container } from 'tsyringe'
import { KbankQrGateway } from './adapters/gateway/kbank-qr.gateway'
import { QrPaymentElysiaController } from './adapters/controllers/qr-payment.controller'
import { QrPaymentV2ElysiaController } from './adapters/controllers/qr-payment-v2.controller'
import { DrizzleQrAttemptRepository } from './adapters/repository/qr-attempt.drizzle.repository'
import { DrizzleQrShiftReadiness } from './adapters/repository/qr-shift-readiness.drizzle.adapter'
import { qrAttemptRepositoryToken } from './applications/ports/qr-attempt.repository'
import { qrShiftReadinessToken } from './applications/ports/qr-shift-readiness.port'
import { CreateQrPaymentV2UseCase } from './applications/usecases/create-qr-payment-v2.usecase'
import { DismissQrPaymentUseCase } from './applications/usecases/dismiss-qr-payment.usecase'
import { ListUnclaimedQrPaymentsUseCase } from './applications/usecases/list-unclaimed-qr-payments.usecase'
import { ListUnresolvedQrAttemptsUseCase } from './applications/usecases/list-unresolved-qr-attempts.usecase'
import { ReadQrPaymentUseCase } from './applications/usecases/read-qr-payment.usecase'
import { ResolveQrAttemptUseCase } from './applications/usecases/resolve-qr-attempt.usecase'
import { DrizzleQrPaymentRepository } from './adapters/repository/qr-payment.drizzle.repository'
import { qrPaymentClaimsToken } from './applications/ports/qr-payment-claims.port'
import { qrPaymentGatewayToken } from './applications/ports/qr-payment-gateway.port'
import { qrPaymentRepositoryToken } from './applications/ports/qr-payment.repository'
import { QrPaymentClaims } from './applications/services/qr-payment-claims'
import { QrPaymentRefresher } from './applications/services/qr-payment-refresher'
import { CancelQrPaymentUseCase } from './applications/usecases/cancel-qr-payment.usecase'
import { CreateQrPaymentUseCase } from './applications/usecases/create-qr-payment.usecase'
import { GetQrConfigUseCase } from './applications/usecases/get-qr-config.usecase'
import { RefreshQrPaymentUseCase } from './applications/usecases/refresh-qr-payment.usecase'

container.register(qrPaymentRepositoryToken, { useClass: DrizzleQrPaymentRepository })
// One instance: it keeps the bank's access token between calls.
container.registerSingleton(qrPaymentGatewayToken, KbankQrGateway)
container.register(qrPaymentClaimsToken, { useClass: QrPaymentClaims })
container.registerSingleton(QrPaymentRefresher)
container.registerSingleton(CreateQrPaymentUseCase)
container.registerSingleton(RefreshQrPaymentUseCase)
container.registerSingleton(GetQrConfigUseCase)
container.registerSingleton(CancelQrPaymentUseCase)
container.register(qrAttemptRepositoryToken, { useClass: DrizzleQrAttemptRepository })
container.register(qrShiftReadinessToken, { useClass: DrizzleQrShiftReadiness })
container.registerSingleton(CreateQrPaymentV2UseCase)
container.registerSingleton(ReadQrPaymentUseCase)
container.registerSingleton(ListUnclaimedQrPaymentsUseCase)
container.registerSingleton(ListUnresolvedQrAttemptsUseCase)
container.registerSingleton(ResolveQrAttemptUseCase)
container.registerSingleton(DismissQrPaymentUseCase)
container.registerSingleton(QrPaymentElysiaController)
container.registerSingleton(QrPaymentV2ElysiaController)
