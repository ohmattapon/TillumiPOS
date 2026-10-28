import { container } from 'tsyringe'
import { printerSettingsToken } from '../receipt-printer/applications/ports/printer-settings.port'
import { quoteShopRulesToken } from '../quotes/applications/ports/quote-shop-rules.port'
import { SettingsElysiaController } from './adapters/controllers/settings.controller'
import { CachedShopSettingsRepository } from './adapters/repository/shop-settings.cached.repository'
import { ShopPrinterSettings } from './adapters/repository/printer-settings.adapter'
import { shopSettingsRepositoryToken } from './applications/ports/shop-settings.repository'
import { GetShopSettingsUseCase } from './applications/usecases/get-shop-settings.usecase'
import { RemoveShopLogoUseCase } from './applications/usecases/remove-shop-logo.usecase'
import { SetShopLogoUseCase } from './applications/usecases/set-shop-logo.usecase'
import { UpdateShopSettingsUseCase } from './applications/usecases/update-shop-settings.usecase'

container.register(shopSettingsRepositoryToken, { useClass: CachedShopSettingsRepository })
container.register(printerSettingsToken, { useClass: ShopPrinterSettings })
container.register(quoteShopRulesToken, { useToken: shopSettingsRepositoryToken })
container.registerSingleton(GetShopSettingsUseCase)
container.registerSingleton(UpdateShopSettingsUseCase)
container.registerSingleton(SetShopLogoUseCase)
container.registerSingleton(RemoveShopLogoUseCase)
container.registerSingleton(SettingsElysiaController)
