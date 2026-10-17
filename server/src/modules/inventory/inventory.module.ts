import { container } from 'tsyringe'
import { InventoryElysiaController } from './adapters/controllers/inventory.controller'
import { DrizzleStockMovementRepository } from './adapters/repository/stock-movement.drizzle.repository'
import { stockLedgerToken } from './applications/ports/stock-ledger.port'
import { stockMovementRepositoryToken } from './applications/ports/stock-movement.repository'
import { StockLedger } from './applications/services/stock-ledger'
import { AdjustStockUseCase } from './applications/usecases/adjust-stock.usecase'
import { ListStockMovementsUseCase } from './applications/usecases/list-stock-movements.usecase'
import { ReceiveStockUseCase } from './applications/usecases/receive-stock.usecase'

container.register(stockMovementRepositoryToken, { useClass: DrizzleStockMovementRepository })
container.register(stockLedgerToken, { useClass: StockLedger })
container.registerSingleton(ListStockMovementsUseCase)
container.registerSingleton(ReceiveStockUseCase)
container.registerSingleton(AdjustStockUseCase)
container.registerSingleton(InventoryElysiaController)
