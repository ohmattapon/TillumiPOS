import { container } from 'tsyringe'
import { UserElysiaController } from './adapters/controllers/user.controller'
import { DrizzleUserRepository } from './adapters/repository/user.drizzle.repository'
import { userRepositoryToken } from './applications/ports/user.repository'
import { CreateUserUseCase } from './applications/usecases/create-user.usecase'
import { ListUsersUseCase } from './applications/usecases/list-users.usecase'
import { UpdateUserUseCase } from './applications/usecases/update-user.usecase'

container.register(userRepositoryToken, { useClass: DrizzleUserRepository })
container.registerSingleton(ListUsersUseCase)
container.registerSingleton(CreateUserUseCase)
container.registerSingleton(UpdateUserUseCase)
container.registerSingleton(UserElysiaController)
