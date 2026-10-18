import { container } from 'tsyringe'
import { StockReceiptElysiaController } from './adapters/controllers/stock-receipt.controller'
import { DrizzleStockReceiptRepository } from './adapters/repository/stock-receipt.drizzle.repository'
import { stockReceiptRepositoryToken } from './applications/ports/stock-receipt.repository'
import { ReceiveStockBatchUseCase } from './applications/usecases/receive-stock-batch.usecase'
import { GetStockReceiptUseCase } from './applications/usecases/get-stock-receipt.usecase'
import { ListStockReceiptsUseCase } from './applications/usecases/list-stock-receipts.usecase'
container.register(stockReceiptRepositoryToken, { useClass: DrizzleStockReceiptRepository })
container.registerSingleton(ReceiveStockBatchUseCase)
container.registerSingleton(GetStockReceiptUseCase)
container.registerSingleton(ListStockReceiptsUseCase)
container.registerSingleton(StockReceiptElysiaController)
