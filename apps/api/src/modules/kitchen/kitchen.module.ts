import { container } from 'tsyringe'
import { DrizzleKitchenStationRepository } from './adapters/repository/kitchen-station.drizzle.repository'
import { KitchenCatalogElysiaController } from './adapters/controllers/kitchen-catalog.controller'
import { kitchenStationRepositoryToken } from './applications/ports/kitchen-station.repository'
import { CreateKitchenStationUseCase } from './applications/usecases/create-kitchen-station.usecase'
import { ListKitchenStationsUseCase } from './applications/usecases/list-kitchen-stations.usecase'
import { UpdateKitchenStationUseCase } from './applications/usecases/update-kitchen-station.usecase'

container.register(kitchenStationRepositoryToken, { useClass: DrizzleKitchenStationRepository })
container.registerSingleton(ListKitchenStationsUseCase)
container.registerSingleton(CreateKitchenStationUseCase)
container.registerSingleton(UpdateKitchenStationUseCase)
container.registerSingleton(KitchenCatalogElysiaController)
