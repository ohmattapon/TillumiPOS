import { container } from 'tsyringe'
import { TOKENS } from '../tokens'
import { BunPasswordHasher } from './adapters/bun-password-hasher'
import { DrizzleUnitOfWork } from './adapters/drizzle-unit-of-work'

container.register(TOKENS.UnitOfWork, { useClass: DrizzleUnitOfWork })
container.register(TOKENS.PasswordHasher, { useClass: BunPasswordHasher })
