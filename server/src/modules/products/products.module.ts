import { container } from 'tsyringe'
import { quoteProductsToken } from '../quotes/applications/ports/quote-products.port'
import { ProductElysiaController } from './adapters/controllers/product.controller'
import { CachedProductRepository } from './adapters/repository/product.cached.repository'
import { DrizzleQuoteProducts } from './adapters/repository/quote-products.drizzle.adapter'
import { productRepositoryToken } from './applications/ports/product.repository'
import { CreateProductUseCase } from './applications/usecases/create-product.usecase'
import { GetProductUseCase } from './applications/usecases/get-product.usecase'
import { ListProductsUseCase } from './applications/usecases/list-products.usecase'
import { RemoveProductImageUseCase } from './applications/usecases/remove-product-image.usecase'
import { SetProductImageUseCase } from './applications/usecases/set-product-image.usecase'
import { UpdateProductUseCase } from './applications/usecases/update-product.usecase'

container.register(productRepositoryToken, { useClass: CachedProductRepository })
// Quotes price carts and find categories through their own port.
container.register(quoteProductsToken, { useClass: DrizzleQuoteProducts })
container.registerSingleton(ListProductsUseCase)
container.registerSingleton(GetProductUseCase)
container.registerSingleton(CreateProductUseCase)
container.registerSingleton(UpdateProductUseCase)
container.registerSingleton(SetProductImageUseCase)
container.registerSingleton(RemoveProductImageUseCase)
container.registerSingleton(ProductElysiaController)
