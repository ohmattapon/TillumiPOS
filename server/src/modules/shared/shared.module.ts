import { container } from 'tsyringe'
import { TOKENS } from '../tokens'
import { BunPasswordHasher } from './adapters/bun-password-hasher'
import { DrizzleUnitOfWork } from './adapters/drizzle-unit-of-work'
import { CryptoIdGenerator } from './adapters/crypto-id-generator'
import { SystemClock } from './adapters/system-clock'
import { createMediaStorage } from './adapters/create-media-storage'
import { EnvCheckoutPolicy } from './adapters/env-checkout-policy'
import { DrizzleCommandReceiptsRepository } from './adapters/drizzle-command-receipts.repository'
import { commandReceiptsToken } from './ports/command-receipts.port'
import { CommandIdempotency } from './applications/command-idempotency'
import { GetCapabilitiesUseCase } from './applications/get-capabilities.usecase'
import { env } from '../../libs/env'
import { resolveCacheConfig } from '../../libs/cache-config'
import { RedisReadCache } from './adapters/redis-read-cache'
import { RepositoryReadCache } from './adapters/repository-read-cache'
import { readCacheToken } from './ports/read-cache.port'
import { repositoryReadCacheToken } from './ports/repository-read-cache.port'

container.register(TOKENS.UnitOfWork, { useClass: DrizzleUnitOfWork })
container.register(TOKENS.PasswordHasher, { useClass: BunPasswordHasher })
container.register(TOKENS.MediaStorage, { useFactory: () => createMediaStorage() })
container.register(TOKENS.Clock, { useClass: SystemClock })
container.register(TOKENS.IdGenerator, { useClass: CryptoIdGenerator })
container.register(TOKENS.CheckoutPolicy, { useClass: EnvCheckoutPolicy })
container.register(commandReceiptsToken, { useClass: DrizzleCommandReceiptsRepository })
container.register(TOKENS.Idempotency, { useClass: CommandIdempotency })
container.registerSingleton(GetCapabilitiesUseCase)
container.registerInstance(readCacheToken, new RedisReadCache(resolveCacheConfig(env.databaseUrl)))
container.registerSingleton(repositoryReadCacheToken, RepositoryReadCache)
