import { container } from 'tsyringe'
import { TableElysiaController } from './adapters/controllers/table.controller'
import { DrizzleTableRepository } from './adapters/repository/table.drizzle.repository'
import { tableRepositoryToken } from './applications/ports/table.repository'
import { CreateTableUseCase } from './applications/usecases/create-table.usecase'
import { ListTablesUseCase } from './applications/usecases/list-tables.usecase'
import { UpdateTableUseCase } from './applications/usecases/update-table.usecase'

container.register(tableRepositoryToken, { useClass: DrizzleTableRepository })
container.registerSingleton(ListTablesUseCase)
container.registerSingleton(CreateTableUseCase)
container.registerSingleton(UpdateTableUseCase)
container.registerSingleton(TableElysiaController)
