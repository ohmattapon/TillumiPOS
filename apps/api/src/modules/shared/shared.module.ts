import { container } from 'tsyringe'
import { TOKENS } from '../tokens'
import { BunPasswordHasher } from './adapters/bun-password-hasher'
import { DrizzleUnitOfWork } from './adapters/drizzle-unit-of-work'
import { SystemClock } from './adapters/system-clock'
import { WorkerMediaStorage } from './adapters/worker-media-storage'
import { EnvCheckoutPolicy } from './adapters/env-checkout-policy'
import { DrizzleCommandReceiptsRepository } from './adapters/drizzle-command-receipts.repository'
import { commandReceiptsToken } from './ports/command-receipts.port'
import { CommandIdempotency } from './applications/command-idempotency'

container.register(TOKENS.UnitOfWork, { useClass: DrizzleUnitOfWork })
container.register(TOKENS.PasswordHasher, { useClass: BunPasswordHasher })
container.register(TOKENS.MediaStorage, { useClass: WorkerMediaStorage })
container.register(TOKENS.Clock, { useClass: SystemClock })
container.register(TOKENS.CheckoutPolicy, { useClass: EnvCheckoutPolicy })
container.register(commandReceiptsToken, { useClass: DrizzleCommandReceiptsRepository })
container.register(TOKENS.Idempotency, { useClass: CommandIdempotency })
