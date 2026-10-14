import { container } from 'tsyringe'
import { OrderElysiaController } from './adapters/controllers/order.controller'
import { DrizzleOrderRepository } from './adapters/repository/order.drizzle.repository'
import { DrizzleTableOccupancy } from './adapters/repository/table-occupancy.drizzle.adapter'
import { orderRepositoryToken } from './applications/ports/order.repository'
import { tableOccupancyToken } from '../tables/applications/ports/table-occupancy.port'
import { AddOrderItemUseCase } from './applications/usecases/add-order-item.usecase'
import { CancelOrderUseCase } from './applications/usecases/cancel-order.usecase'
import { GetOrderUseCase } from './applications/usecases/get-order.usecase'
import { ListOrdersUseCase } from './applications/usecases/list-orders.usecase'
import { OpenOrderUseCase } from './applications/usecases/open-order.usecase'
import { PayOrderUseCase } from './applications/usecases/pay-order.usecase'
import { PayOrderV2UseCase } from './applications/usecases/pay-order-v2.usecase'
import { PayOrderV2ElysiaController } from './adapters/controllers/pay-order-v2.controller'
import { RemoveOrderItemUseCase } from './applications/usecases/remove-order-item.usecase'
import { RemoveOrderLineUseCase } from './applications/usecases/remove-order-line.usecase'
import { RenameOrderUseCase } from './applications/usecases/rename-order.usecase'
import { SetOrderItemQuantityUseCase } from './applications/usecases/set-order-item-quantity.usecase'
import { SetOrderLineQuantityUseCase } from './applications/usecases/set-order-line-quantity.usecase'

container.register(orderRepositoryToken, { useClass: DrizzleOrderRepository })
container.register(tableOccupancyToken, { useClass: DrizzleTableOccupancy })
container.registerSingleton(ListOrdersUseCase)
container.registerSingleton(GetOrderUseCase)
container.registerSingleton(OpenOrderUseCase)
container.registerSingleton(RenameOrderUseCase)
container.registerSingleton(AddOrderItemUseCase)
container.registerSingleton(SetOrderItemQuantityUseCase)
container.registerSingleton(RemoveOrderItemUseCase)
container.registerSingleton(SetOrderLineQuantityUseCase)
container.registerSingleton(RemoveOrderLineUseCase)
container.registerSingleton(CancelOrderUseCase)
container.registerSingleton(PayOrderUseCase)
container.registerSingleton(PayOrderV2UseCase)
container.registerSingleton(OrderElysiaController)
container.registerSingleton(PayOrderV2ElysiaController)
