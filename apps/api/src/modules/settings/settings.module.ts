import { container } from 'tsyringe'
import { SettingsElysiaController } from './adapters/controllers/settings.controller'
import { DrizzleShopSettingsRepository } from './adapters/repository/shop-settings.drizzle.repository'
import { shopSettingsRepositoryToken } from './applications/ports/shop-settings.repository'
import { GetShopSettingsUseCase } from './applications/usecases/get-shop-settings.usecase'
import { UpdateShopSettingsUseCase } from './applications/usecases/update-shop-settings.usecase'

container.register(shopSettingsRepositoryToken, { useClass: DrizzleShopSettingsRepository })
container.registerSingleton(GetShopSettingsUseCase)
container.registerSingleton(UpdateShopSettingsUseCase)
container.registerSingleton(SettingsElysiaController)
