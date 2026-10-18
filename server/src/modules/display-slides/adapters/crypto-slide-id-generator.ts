import type { ISlideIdGenerator } from '../applications/ports/slide-id-generator.port'

/** Fresh UUIDs from the platform's secure random source. */
export class CryptoSlideIdGenerator implements ISlideIdGenerator {
  newId() {
    return crypto.randomUUID()
  }
}
