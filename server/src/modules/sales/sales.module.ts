import { container } from 'tsyringe'
import { salesReportRepositoryToken } from './applications/ports/sales-report.repository'
import { DrizzleSalesReportRepository } from './adapters/repository/sales-report.drizzle.repository'
import { GetSalesReportUseCase } from './applications/usecases/get-sales-report.usecase'
import { GetPromotionReportUseCase } from './applications/usecases/get-promotion-report.usecase'
import { ListReportProductsUseCase } from './applications/usecases/list-report-products.usecase'
import { ListReportBranchesUseCase } from './applications/usecases/list-report-branches.usecase'
import { SalesReportElysiaController } from './adapters/controllers/sales-report.controller'

container.register(salesReportRepositoryToken, { useClass: DrizzleSalesReportRepository })
container.registerSingleton(GetSalesReportUseCase)
container.registerSingleton(GetPromotionReportUseCase)
container.registerSingleton(ListReportProductsUseCase)
container.registerSingleton(ListReportBranchesUseCase)
container.registerSingleton(SalesReportElysiaController)
import { SaleElysiaController } from './adapters/controllers/sale.controller'
import { DrizzleSaleRepository } from './adapters/repository/sale.drizzle.repository'
import { saleRepositoryToken } from './applications/ports/sale.repository'
import { saleCheckoutToken } from './applications/ports/sale-checkout.port'
import { shiftSalesTotalsToken } from './applications/ports/shift-sales-totals.port'
import { DrizzleShiftSalesTotals } from './adapters/repository/shift-sales-totals.drizzle.adapter'
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
container.register(shiftSalesTotalsToken, { useClass: DrizzleShiftSalesTotals })
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

import { memberSalesHistoryToken } from '../members/applications/ports/member-sales-history.port'
import { DrizzleMemberSalesHistory } from './adapters/repository/member-sales-history.drizzle.adapter'
container.register(memberSalesHistoryToken, { useClass: DrizzleMemberSalesHistory })
