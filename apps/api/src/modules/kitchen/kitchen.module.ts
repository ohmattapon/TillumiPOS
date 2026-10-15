import { container } from 'tsyringe'
import { DrizzleKitchenRoutingRepository } from './adapters/repository/kitchen-routing.drizzle.repository'
import { DrizzleKitchenStationRepository } from './adapters/repository/kitchen-station.drizzle.repository'
import { KitchenCatalogElysiaController } from './adapters/controllers/kitchen-catalog.controller'
import { kitchenRoutingRepositoryToken } from './applications/ports/kitchen-routing.repository'
import { kitchenStationRepositoryToken } from './applications/ports/kitchen-station.repository'
import { CreateKitchenStationUseCase } from './applications/usecases/create-kitchen-station.usecase'
import { ListCategoryRoutingUseCase } from './applications/usecases/list-category-routing.usecase'
import { ListKitchenStationsUseCase } from './applications/usecases/list-kitchen-stations.usecase'
import { SetCategoryStationUseCase } from './applications/usecases/set-category-station.usecase'
import { UpdateKitchenStationUseCase } from './applications/usecases/update-kitchen-station.usecase'

container.register(kitchenStationRepositoryToken, { useClass: DrizzleKitchenStationRepository })
container.register(kitchenRoutingRepositoryToken, { useClass: DrizzleKitchenRoutingRepository })
container.registerSingleton(ListKitchenStationsUseCase)
container.registerSingleton(CreateKitchenStationUseCase)
container.registerSingleton(UpdateKitchenStationUseCase)
container.registerSingleton(SetCategoryStationUseCase)
container.registerSingleton(ListCategoryRoutingUseCase)
container.registerSingleton(KitchenCatalogElysiaController)
