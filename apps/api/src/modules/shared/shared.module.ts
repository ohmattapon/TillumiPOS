import { container } from 'tsyringe'
import { TOKENS } from '../tokens'
import { DrizzleUnitOfWork } from './adapters/drizzle-unit-of-work'

container.register(TOKENS.UnitOfWork, { useClass: DrizzleUnitOfWork })
