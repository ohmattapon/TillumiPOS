import { container } from 'tsyringe'
import { OrderElysiaController } from './adapters/controllers/order.controller'
import { DrizzleOrderRepository } from './adapters/repository/order.drizzle.repository'
import { orderRepositoryToken } from './applications/ports/order.repository'
import { AddOrderItemUseCase } from './applications/usecases/add-order-item.usecase'
import { CancelOrderUseCase } from './applications/usecases/cancel-order.usecase'
import { GetOrderUseCase } from './applications/usecases/get-order.usecase'
import { ListOrdersUseCase } from './applications/usecases/list-orders.usecase'
import { OpenOrderUseCase } from './applications/usecases/open-order.usecase'
import { PayOrderUseCase } from './applications/usecases/pay-order.usecase'
import { RemoveOrderItemUseCase } from './applications/usecases/remove-order-item.usecase'
import { RenameOrderUseCase } from './applications/usecases/rename-order.usecase'
import { SetOrderItemQuantityUseCase } from './applications/usecases/set-order-item-quantity.usecase'

container.register(orderRepositoryToken, { useClass: DrizzleOrderRepository })
container.registerSingleton(ListOrdersUseCase)
container.registerSingleton(GetOrderUseCase)
container.registerSingleton(OpenOrderUseCase)
container.registerSingleton(RenameOrderUseCase)
container.registerSingleton(AddOrderItemUseCase)
container.registerSingleton(SetOrderItemQuantityUseCase)
container.registerSingleton(RemoveOrderItemUseCase)
container.registerSingleton(CancelOrderUseCase)
container.registerSingleton(PayOrderUseCase)
container.registerSingleton(OrderElysiaController)
