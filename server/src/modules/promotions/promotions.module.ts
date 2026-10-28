import { container } from 'tsyringe'
import { PromotionElysiaController } from './adapters/controllers/promotion.controller'
import { DrizzlePromotionRepository } from './adapters/repository/promotion.drizzle.repository'
import { DrizzlePromotionUsage } from './adapters/repository/promotion-usage.drizzle'
import { promotionRepositoryToken } from './applications/ports/promotion.repository'
import { promotionStatsToken } from './applications/ports/promotion-stats.port'
import { CreatePromotionUseCase } from './applications/usecases/create-promotion.usecase'
import { GetPromotionUseCase } from './applications/usecases/get-promotion.usecase'
import { ListPromotionsUseCase } from './applications/usecases/list-promotions.usecase'
import { RemovePromotionImageUseCase } from './applications/usecases/remove-promotion-image.usecase'
import { SetPromotionImageUseCase } from './applications/usecases/set-promotion-image.usecase'
import { UpdatePromotionUseCase } from './applications/usecases/update-promotion.usecase'
import { promotionCatalogToken } from '../quotes/applications/ports/promotion-catalog.port'
import { promotionUsageToken } from '../quotes/applications/ports/promotion-usage.port'
import { PromotionCatalog } from './applications/services/promotion-catalog'

container.register(promotionRepositoryToken, { useClass: DrizzlePromotionRepository })
// The quotes module asks the usage questions through the consumer-owned port; the report asks this module's own.
container.register(promotionUsageToken, { useClass: DrizzlePromotionUsage })
container.register(promotionStatsToken, { useClass: DrizzlePromotionUsage })
container.registerSingleton(CreatePromotionUseCase)
container.registerSingleton(UpdatePromotionUseCase)
container.registerSingleton(GetPromotionUseCase)
container.registerSingleton(ListPromotionsUseCase)
container.registerSingleton(SetPromotionImageUseCase)
container.registerSingleton(RemovePromotionImageUseCase)
container.registerSingleton(PromotionElysiaController)
container.register(promotionCatalogToken, { useClass: PromotionCatalog })
