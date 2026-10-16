import { container } from 'tsyringe'
import { UserElysiaController } from './adapters/controllers/user.controller'
import { DrizzleUserRepository } from './adapters/repository/user.drizzle.repository'
import { firstRunGuardToken } from '../setup/applications/ports/first-run-guard.port'
import { DrizzleFirstRunGuard } from './adapters/repository/first-run-guard.drizzle.adapter'
import { userRepositoryToken } from './applications/ports/user.repository'
import { CreateUserUseCase } from './applications/usecases/create-user.usecase'
import { ListUsersUseCase } from './applications/usecases/list-users.usecase'
import { UpdateUserUseCase } from './applications/usecases/update-user.usecase'
import { roleUsageToken } from '../roles/applications/ports/role-usage.port'
import { DrizzleRoleUsage } from './adapters/repository/role-usage.drizzle.adapter'

container.register(userRepositoryToken, { useClass: DrizzleUserRepository })
container.register(roleUsageToken, { useClass: DrizzleRoleUsage })
container.register(firstRunGuardToken, { useClass: DrizzleFirstRunGuard })
container.registerSingleton(ListUsersUseCase)
container.registerSingleton(CreateUserUseCase)
container.registerSingleton(UpdateUserUseCase)
container.registerSingleton(UserElysiaController)
