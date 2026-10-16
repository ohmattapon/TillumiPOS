import { container } from 'tsyringe'
import { PromotionElysiaController } from './adapters/controllers/promotion.controller'
import { DrizzlePromotionRepository } from './adapters/repository/promotion.drizzle.repository'
import { promotionRepositoryToken } from './applications/ports/promotion.repository'
import { CreatePromotionUseCase } from './applications/usecases/create-promotion.usecase'
import { GetPromotionUseCase } from './applications/usecases/get-promotion.usecase'
import { ListPromotionsUseCase } from './applications/usecases/list-promotions.usecase'
import { UpdatePromotionUseCase } from './applications/usecases/update-promotion.usecase'
import { promotionCatalogToken } from '../quotes/applications/ports/promotion-catalog.port'
import { PromotionCatalog } from './applications/services/promotion-catalog'

container.register(promotionRepositoryToken, { useClass: DrizzlePromotionRepository })
container.registerSingleton(CreatePromotionUseCase)
container.registerSingleton(UpdatePromotionUseCase)
container.registerSingleton(GetPromotionUseCase)
container.registerSingleton(ListPromotionsUseCase)
container.registerSingleton(PromotionElysiaController)
container.register(promotionCatalogToken, { useClass: PromotionCatalog })
