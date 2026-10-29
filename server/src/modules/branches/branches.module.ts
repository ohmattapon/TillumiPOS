import { container } from 'tsyringe'
import { BranchElysiaController } from './adapters/controllers/branch.controller'
import { ReportBranchNamesAdapter } from './adapters/report-branch-names.adapter'
import { DrizzleBranchRepository } from './adapters/repository/branch.drizzle.repository'
import { branchRepositoryToken } from './applications/ports/branch.repository'
import { CreateBranchUseCase } from './applications/usecases/create-branch.usecase'
import { ListBranchesUseCase } from './applications/usecases/list-branches.usecase'
import { ResolveBranchUseCase } from './applications/usecases/resolve-branch.usecase'
import { reportBranchNamesToken } from '../sales/applications/ports/report-branch-names.port'
import { UpdateBranchUseCase } from './applications/usecases/update-branch.usecase'

container.register(branchRepositoryToken, { useClass: DrizzleBranchRepository })
container.register(reportBranchNamesToken, { useClass: ReportBranchNamesAdapter })
container.registerSingleton(ListBranchesUseCase)
container.registerSingleton(CreateBranchUseCase)
container.registerSingleton(UpdateBranchUseCase)
container.registerSingleton(ResolveBranchUseCase)
container.registerSingleton(BranchElysiaController)
