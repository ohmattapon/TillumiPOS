import { sessionAuthorizationReaderToken } from './applications/ports/session-authorization-reader.port'
import { DrizzleSessionAuthorizationReader } from '../../infrastructure/database/authorization.drizzle.reader'
import { container } from 'tsyringe'
import { AuthElysiaController } from './adapters/controllers/auth.controller'
import { AuthorizeSessionUseCase } from './applications/usecases/authorize-session.usecase'
import { SetOwnPinUseCase } from './applications/usecases/set-own-pin.usecase'
import { LoginUseCase } from './applications/usecases/login.usecase'

container.registerSingleton(LoginUseCase)
container.registerSingleton(AuthorizeSessionUseCase)
container.registerSingleton(SetOwnPinUseCase)
container.registerSingleton(AuthElysiaController)

container.register(sessionAuthorizationReaderToken, { useClass: DrizzleSessionAuthorizationReader })
