import { container } from 'tsyringe'
import { ReportCategoryNamesAdapter } from './adapters/report-category-names.adapter'
import { CategoryElysiaController } from './adapters/controllers/category.controller'
import { CachedCategoryRepository } from './adapters/repository/category.cached.repository'
import { categoryRepositoryToken } from './applications/ports/category.repository'
import { CreateCategoryUseCase } from './applications/usecases/create-category.usecase'
import { reportCategoryNamesToken } from '../sales/applications/ports/report-category-names.port'
import { ListCategoriesUseCase } from './applications/usecases/list-categories.usecase'
import { UpdateCategoryUseCase } from './applications/usecases/update-category.usecase'

container.register(categoryRepositoryToken, { useClass: CachedCategoryRepository })
container.register(reportCategoryNamesToken, { useClass: ReportCategoryNamesAdapter })
container.registerSingleton(ListCategoriesUseCase)
container.registerSingleton(CreateCategoryUseCase)
container.registerSingleton(UpdateCategoryUseCase)
container.registerSingleton(CategoryElysiaController)
