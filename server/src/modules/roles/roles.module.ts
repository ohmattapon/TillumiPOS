import { container } from 'tsyringe'
import { roleDirectoryToken } from '../users/applications/ports/role-directory.port'
import { rolePermissionReaderToken } from '../auth/applications/ports/role-permission-reader.port'
import { RoleDirectoryAdapter } from './adapters/role-directory.adapter'
import { DrizzleRoleRepository } from './adapters/repository/role.drizzle.repository'
import { roleRepositoryToken } from './applications/ports/role.repository'
import { CreateRoleUseCase } from './applications/usecases/create-role.usecase'
import { UpdateRoleUseCase } from './applications/usecases/update-role.usecase'
import { DeleteRoleUseCase } from './applications/usecases/delete-role.usecase'
import { ListRolesUseCase } from './applications/usecases/list-roles.usecase'
import { GetRoleUseCase } from './applications/usecases/get-role.usecase'
import { RoleElysiaController } from './adapters/controllers/role.controller'
container.register(roleRepositoryToken, { useClass: DrizzleRoleRepository })
container.register(roleDirectoryToken, { useClass: RoleDirectoryAdapter })
container.register(rolePermissionReaderToken, { useClass: RoleDirectoryAdapter })
container.registerSingleton(CreateRoleUseCase)
container.registerSingleton(UpdateRoleUseCase)
container.registerSingleton(DeleteRoleUseCase)
container.registerSingleton(ListRolesUseCase)
container.registerSingleton(GetRoleUseCase)
container.registerSingleton(RoleElysiaController)
