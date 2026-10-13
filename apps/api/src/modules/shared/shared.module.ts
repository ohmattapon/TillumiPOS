import { container } from 'tsyringe'
import { TOKENS } from '../tokens'
import { BunPasswordHasher } from './adapters/bun-password-hasher'
import { DrizzleUnitOfWork } from './adapters/drizzle-unit-of-work'
import { SystemClock } from './adapters/system-clock'
import { WorkerMediaStorage } from './adapters/worker-media-storage'

container.register(TOKENS.UnitOfWork, { useClass: DrizzleUnitOfWork })
container.register(TOKENS.PasswordHasher, { useClass: BunPasswordHasher })
container.register(TOKENS.MediaStorage, { useClass: WorkerMediaStorage })
container.register(TOKENS.Clock, { useClass: SystemClock })
