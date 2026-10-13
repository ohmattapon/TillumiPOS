import { container } from 'tsyringe'
import { SaleElysiaController } from './adapters/controllers/sale.controller'
import { DrizzleSaleRepository } from './adapters/repository/sale.drizzle.repository'
import { saleRepositoryToken } from './applications/ports/sale.repository'
import { CompleteSaleUseCase } from './applications/usecases/complete-sale.usecase'
import { GetSaleUseCase } from './applications/usecases/get-sale.usecase'
import { GetSalesSummaryUseCase } from './applications/usecases/get-sales-summary.usecase'
import { ListSalesUseCase } from './applications/usecases/list-sales.usecase'
import { VoidSaleUseCase } from './applications/usecases/void-sale.usecase'

container.register(saleRepositoryToken, { useClass: DrizzleSaleRepository })
container.registerSingleton(ListSalesUseCase)
container.registerSingleton(GetSaleUseCase)
container.registerSingleton(GetSalesSummaryUseCase)
container.registerSingleton(CompleteSaleUseCase)
container.registerSingleton(VoidSaleUseCase)
container.registerSingleton(SaleElysiaController)
