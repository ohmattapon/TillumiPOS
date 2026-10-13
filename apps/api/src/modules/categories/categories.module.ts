import { container } from 'tsyringe'
import { CategoryElysiaController } from './adapters/controllers/category.controller'
import { DrizzleCategoryRepository } from './adapters/repository/category.drizzle.repository'
import { categoryRepositoryToken } from './applications/ports/category.repository'
import { CreateCategoryUseCase } from './applications/usecases/create-category.usecase'
import { ListCategoriesUseCase } from './applications/usecases/list-categories.usecase'
import { UpdateCategoryUseCase } from './applications/usecases/update-category.usecase'

container.register(categoryRepositoryToken, { useClass: DrizzleCategoryRepository })
container.registerSingleton(ListCategoriesUseCase)
container.registerSingleton(CreateCategoryUseCase)
container.registerSingleton(UpdateCategoryUseCase)
container.registerSingleton(CategoryElysiaController)
