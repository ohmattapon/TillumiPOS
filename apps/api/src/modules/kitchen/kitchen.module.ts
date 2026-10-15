import { container } from 'tsyringe'
import { DrizzleKitchenRoutingRepository } from './adapters/repository/kitchen-routing.drizzle.repository'
import { DrizzleKitchenStationRepository } from './adapters/repository/kitchen-station.drizzle.repository'
import { DrizzleKitchenTicketRepository } from './adapters/repository/kitchen-ticket.drizzle.repository'
import { DrizzleKitchenTickets } from './adapters/repository/kitchen-tickets.drizzle.adapter'
import { KitchenCatalogElysiaController } from './adapters/controllers/kitchen-catalog.controller'
import { kitchenRoutingRepositoryToken } from './applications/ports/kitchen-routing.repository'
import { kitchenStationRepositoryToken } from './applications/ports/kitchen-station.repository'
import { kitchenTicketRepositoryToken } from './applications/ports/kitchen-ticket.repository'
import { kitchenTicketsToken } from '../orders/applications/ports/kitchen-tickets.port'
import { CreateKitchenStationUseCase } from './applications/usecases/create-kitchen-station.usecase'
import { ListCategoryRoutingUseCase } from './applications/usecases/list-category-routing.usecase'
import { ListKitchenStationsUseCase } from './applications/usecases/list-kitchen-stations.usecase'
import { SendOrderToKitchenUseCase } from './applications/usecases/send-order-to-kitchen.usecase'
import { SetCategoryStationUseCase } from './applications/usecases/set-category-station.usecase'
import { UpdateKitchenStationUseCase } from './applications/usecases/update-kitchen-station.usecase'

container.register(kitchenStationRepositoryToken, { useClass: DrizzleKitchenStationRepository })
container.register(kitchenRoutingRepositoryToken, { useClass: DrizzleKitchenRoutingRepository })
container.register(kitchenTicketRepositoryToken, { useClass: DrizzleKitchenTicketRepository })
container.register(kitchenTicketsToken, { useClass: DrizzleKitchenTickets })
container.registerSingleton(ListKitchenStationsUseCase)
container.registerSingleton(CreateKitchenStationUseCase)
container.registerSingleton(UpdateKitchenStationUseCase)
container.registerSingleton(SetCategoryStationUseCase)
container.registerSingleton(ListCategoryRoutingUseCase)
container.registerSingleton(SendOrderToKitchenUseCase)
container.registerSingleton(KitchenCatalogElysiaController)
