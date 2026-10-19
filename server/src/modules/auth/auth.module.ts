import { sessionAuthorizationReaderToken } from './applications/ports/session-authorization-reader.port'
import { DrizzleSessionAuthorizationReader } from '../../infrastructure/database/authorization.drizzle.reader'
import { container } from 'tsyringe'
import { AuthElysiaController } from './adapters/controllers/auth.controller'
import { AuthorizeSessionUseCase } from './applications/usecases/authorize-session.usecase'
import { SetOwnPinUseCase } from './applications/usecases/set-own-pin.usecase'
import { LoginUseCase } from './applications/usecases/login.usecase'
import { ListSwitchableUsersUseCase } from './applications/usecases/list-switchable-users.usecase'
import { SwitchUserUseCase } from './applications/usecases/switch-user.usecase'
import { pinGuardToken } from './applications/ports/pin-guard.port'
import { InMemoryPinGuard } from './adapters/in-memory-pin-guard'
import { loginAttemptGuardToken } from './applications/ports/login-attempt-guard.port'
import { InMemoryLoginGuard } from './adapters/in-memory-login-guard'

container.registerSingleton(LoginUseCase)
container.registerSingleton(AuthorizeSessionUseCase)
container.registerSingleton(SetOwnPinUseCase)
container.registerSingleton(ListSwitchableUsersUseCase)
container.registerSingleton(SwitchUserUseCase)
container.registerSingleton(AuthElysiaController)

// One instance for the process: the failure counts must be shared by every request.
container.registerInstance(pinGuardToken, new InMemoryPinGuard())
container.registerInstance(loginAttemptGuardToken, new InMemoryLoginGuard())
container.register(sessionAuthorizationReaderToken, { useClass: DrizzleSessionAuthorizationReader })
