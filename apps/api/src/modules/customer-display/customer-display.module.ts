import { container } from 'tsyringe'
import { CustomerDisplayElysiaController } from './adapters/controllers/customer-display.controller'
import { InMemoryDisplayHub } from './adapters/in-memory-display-hub'
import { CryptoDisplayIdentifiers, InMemoryPairingGuard } from './adapters/in-memory-pairing-guard'
import { displaySessionStoreToken } from './applications/ports/display-session-store.port'
import { displayStreamToken } from './applications/ports/display-stream.port'
import { displayIdentifiersToken, pairingGuardToken } from './applications/ports/pairing-guard.port'
import { GetDisplayPairingUseCase } from './applications/usecases/get-display-pairing.usecase'
import { OpenDisplayStreamUseCase } from './applications/usecases/open-display-stream.usecase'
import { PairDisplayUseCase } from './applications/usecases/pair-display.usecase'
import { PublishDisplayStateUseCase } from './applications/usecases/publish-display-state.usecase'
import { StartDisplaySessionUseCase } from './applications/usecases/start-display-session.usecase'
import { UnpairDisplayUseCase } from './applications/usecases/unpair-display.usecase'

// One hub for the whole process: it holds the screens, the last state of each till and the live streams, and it
// is both the store and the stream of the two ports.
const hub = new InMemoryDisplayHub()
container.registerInstance(displaySessionStoreToken, hub)
container.registerInstance(displayStreamToken, hub)
container.registerInstance(pairingGuardToken, new InMemoryPairingGuard())
container.registerInstance(displayIdentifiersToken, new CryptoDisplayIdentifiers())

container.registerSingleton(StartDisplaySessionUseCase)
container.registerSingleton(PairDisplayUseCase)
container.registerSingleton(PublishDisplayStateUseCase)
container.registerSingleton(UnpairDisplayUseCase)
container.registerSingleton(GetDisplayPairingUseCase)
container.registerSingleton(OpenDisplayStreamUseCase)
container.registerSingleton(CustomerDisplayElysiaController)
