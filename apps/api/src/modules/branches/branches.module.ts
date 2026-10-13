import { container } from 'tsyringe'
import { BranchElysiaController } from './adapters/controllers/branch.controller'
import { DrizzleBranchRepository } from './adapters/repository/branch.drizzle.repository'
import { branchRepositoryToken } from './applications/ports/branch.repository'
import { CreateBranchUseCase } from './applications/usecases/create-branch.usecase'
import { ListBranchesUseCase } from './applications/usecases/list-branches.usecase'
import { ResolveBranchUseCase } from './applications/usecases/resolve-branch.usecase'
import { UpdateBranchUseCase } from './applications/usecases/update-branch.usecase'

container.register(branchRepositoryToken, { useClass: DrizzleBranchRepository })
container.registerSingleton(ListBranchesUseCase)
container.registerSingleton(CreateBranchUseCase)
container.registerSingleton(UpdateBranchUseCase)
container.registerSingleton(ResolveBranchUseCase)
container.registerSingleton(BranchElysiaController)
