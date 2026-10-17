import { container } from 'tsyringe'
import { QuoteElysiaController } from './adapters/controllers/quote.controller'
import { DrizzlePriceQuoteRepository } from './adapters/repository/price-quote.drizzle.repository'
import { orderEditLockToken } from '../orders/applications/ports/order-edit-lock.port'
import { priceQuoteRepositoryToken } from './applications/ports/price-quote.repository'
import { quoteClaimsToken } from './applications/ports/quote-claims.port'
import { OrderEditLock } from './applications/services/order-edit-lock'
import { QuoteClaims } from './applications/services/quote-claims'
import { CancelQuoteUseCase } from './applications/usecases/cancel-quote.usecase'
import { CreateQuoteUseCase } from './applications/usecases/create-quote.usecase'
import { GetQuoteUseCase } from './applications/usecases/get-quote.usecase'

container.register(priceQuoteRepositoryToken, { useClass: DrizzlePriceQuoteRepository })
container.register(quoteClaimsToken, { useClass: QuoteClaims })
// The orders module asks whether an order may change; quotes know which orders a QR is waiting on.
container.register(orderEditLockToken, { useClass: OrderEditLock })
container.registerSingleton(CreateQuoteUseCase)
container.registerSingleton(GetQuoteUseCase)
container.registerSingleton(CancelQuoteUseCase)
container.registerSingleton(QuoteElysiaController)
