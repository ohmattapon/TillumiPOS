import { container } from 'tsyringe'
import { quoteShopRulesToken } from '../quotes/applications/ports/quote-shop-rules.port'
import { SettingsElysiaController } from './adapters/controllers/settings.controller'
import { CachedShopSettingsRepository } from './adapters/repository/shop-settings.cached.repository'
import { shopSettingsRepositoryToken } from './applications/ports/shop-settings.repository'
import { GetShopSettingsUseCase } from './applications/usecases/get-shop-settings.usecase'
import { UpdateShopSettingsUseCase } from './applications/usecases/update-shop-settings.usecase'

container.register(shopSettingsRepositoryToken, { useClass: CachedShopSettingsRepository })
container.register(quoteShopRulesToken, { useToken: shopSettingsRepositoryToken })
container.registerSingleton(GetShopSettingsUseCase)
container.registerSingleton(UpdateShopSettingsUseCase)
container.registerSingleton(SettingsElysiaController)
