import { container } from 'tsyringe'
import { OrderElysiaController } from './adapters/controllers/order.controller'
import { GuardedOrderRepository } from './applications/decorators/guarded-order.repository'
import { DrizzleOrderRepository } from './adapters/repository/order.drizzle.repository'
import { DrizzleKitchenOrderRefs } from './adapters/repository/kitchen-order-refs.drizzle.adapter'
import { DrizzleTableOccupancy } from './adapters/repository/table-occupancy.drizzle.adapter'
import { orderRepositoryInnerToken, orderRepositoryToken } from './applications/ports/order.repository'
import { kitchenOrderRefsToken } from '../kitchen/applications/ports/kitchen-order-refs.port'
import { tableOccupancyToken } from '../tables/applications/ports/table-occupancy.port'
import { orderQuoteSourceToken } from '../quotes/applications/ports/order-quote-source.port'
import { OrderQuoteSource } from './applications/services/order-quote-source'
import { AddOrderItemUseCase } from './applications/usecases/add-order-item.usecase'
import { CancelOrderUseCase } from './applications/usecases/cancel-order.usecase'
import { GetOrderUseCase } from './applications/usecases/get-order.usecase'
import { ListOrdersUseCase } from './applications/usecases/list-orders.usecase'
import { OpenOrderUseCase } from './applications/usecases/open-order.usecase'
import { PayOrderUseCase } from './applications/usecases/pay-order.usecase'
import { PayOrderV2UseCase } from './applications/usecases/pay-order-v2.usecase'
import { PayOrderV2ElysiaController } from './adapters/controllers/pay-order-v2.controller'
import { MergeOrdersUseCase } from './applications/usecases/merge-orders.usecase'
import { MoveOrderToTableUseCase } from './applications/usecases/move-order-to-table.usecase'
import { RemoveOrderItemUseCase } from './applications/usecases/remove-order-item.usecase'
import { RemoveOrderLineUseCase } from './applications/usecases/remove-order-line.usecase'
import { RenameOrderUseCase } from './applications/usecases/rename-order.usecase'
import { SetOrderItemQuantityUseCase } from './applications/usecases/set-order-item-quantity.usecase'
import { SplitOrderUseCase } from './applications/usecases/split-order.usecase'
import { SetOrderLineNoteUseCase } from './applications/usecases/set-order-line-note.usecase'
import { SetOrderLineQuantityUseCase } from './applications/usecases/set-order-line-quantity.usecase'

container.register(orderRepositoryInnerToken, { useClass: DrizzleOrderRepository })
container.register(orderRepositoryToken, { useClass: GuardedOrderRepository })
container.register(tableOccupancyToken, { useClass: DrizzleTableOccupancy })
container.register(orderQuoteSourceToken, { useClass: OrderQuoteSource })
container.register(kitchenOrderRefsToken, { useClass: DrizzleKitchenOrderRefs })
container.registerSingleton(ListOrdersUseCase)
container.registerSingleton(GetOrderUseCase)
container.registerSingleton(OpenOrderUseCase)
container.registerSingleton(RenameOrderUseCase)
container.registerSingleton(AddOrderItemUseCase)
container.registerSingleton(SetOrderItemQuantityUseCase)
container.registerSingleton(RemoveOrderItemUseCase)
container.registerSingleton(MoveOrderToTableUseCase)
container.registerSingleton(MergeOrdersUseCase)
container.registerSingleton(SplitOrderUseCase)
container.registerSingleton(SetOrderLineQuantityUseCase)
container.registerSingleton(RemoveOrderLineUseCase)
container.registerSingleton(SetOrderLineNoteUseCase)
container.registerSingleton(CancelOrderUseCase)
container.registerSingleton(PayOrderUseCase)
container.registerSingleton(PayOrderV2UseCase)
container.registerSingleton(OrderElysiaController)
container.registerSingleton(PayOrderV2ElysiaController)

import { SetOrderMemberUseCase } from './applications/usecases/set-order-member.usecase'
container.registerSingleton(SetOrderMemberUseCase)
