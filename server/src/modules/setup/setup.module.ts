import { container } from 'tsyringe'
import { SetupElysiaController } from './adapters/controllers/setup.controller'
import { InMemorySetupCode } from './adapters/in-memory-setup-code'
import { setupCodeToken } from './applications/ports/setup-code.port'
import { CompleteSetupUseCase } from './applications/usecases/complete-setup.usecase'
import { GetSetupStatusUseCase } from './applications/usecases/get-setup-status.usecase'

// One instance for the whole process: the code and the failed tries live in it.
container.registerInstance(setupCodeToken, new InMemorySetupCode())
container.registerSingleton(GetSetupStatusUseCase)
container.registerSingleton(CompleteSetupUseCase)
container.registerSingleton(SetupElysiaController)
