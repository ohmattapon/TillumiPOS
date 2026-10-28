import { injectable } from 'tsyringe'
import type { IIdGenerator } from '../ports/id-generator.port'

@injectable()
export class CryptoIdGenerator implements IIdGenerator {
  newId() {
    return crypto.randomUUID()
  }
}
