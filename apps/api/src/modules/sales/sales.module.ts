import { container } from 'tsyringe'
import { SaleElysiaController } from './adapters/controllers/sale.controller'
import { DrizzleSaleRepository } from './adapters/repository/sale.drizzle.repository'
import { saleRepositoryToken } from './applications/ports/sale.repository'
import { saleCheckoutToken } from './applications/ports/sale-checkout.port'
import { SaleCheckout } from './applications/services/sale-checkout'
import { CompleteSaleUseCase } from './applications/usecases/complete-sale.usecase'
import { CompleteSaleV2UseCase } from './applications/usecases/complete-sale-v2.usecase'
import { SaleV2ElysiaController } from './adapters/controllers/sale-v2.controller'
import { GetSaleUseCase } from './applications/usecases/get-sale.usecase'
import { GetSalesSummaryUseCase } from './applications/usecases/get-sales-summary.usecase'
import { ListSalesUseCase } from './applications/usecases/list-sales.usecase'
import { VoidSaleUseCase } from './applications/usecases/void-sale.usecase'
import { VoidSaleV2UseCase } from './applications/usecases/void-sale-v2.usecase'
import { RecordCashRefundUseCase } from './applications/usecases/record-cash-refund.usecase'

container.register(saleRepositoryToken, { useClass: DrizzleSaleRepository })
container.register(saleCheckoutToken, { useClass: SaleCheckout })
container.registerSingleton(ListSalesUseCase)
container.registerSingleton(GetSaleUseCase)
container.registerSingleton(GetSalesSummaryUseCase)
container.registerSingleton(CompleteSaleUseCase)
container.registerSingleton(CompleteSaleV2UseCase)
container.registerSingleton(VoidSaleUseCase)
container.registerSingleton(VoidSaleV2UseCase)
container.registerSingleton(RecordCashRefundUseCase)
container.registerSingleton(SaleElysiaController)
container.registerSingleton(SaleV2ElysiaController)
