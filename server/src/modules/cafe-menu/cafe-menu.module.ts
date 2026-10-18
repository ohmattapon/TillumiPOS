import { container } from 'tsyringe'
import { CafeMenuElysiaController } from './adapters/controllers/cafe-menu.controller'
import { ApplyCafeMenuUseCase } from './applications/usecases/apply-cafe-menu.usecase'

container.registerSingleton(ApplyCafeMenuUseCase)
container.registerSingleton(CafeMenuElysiaController)
