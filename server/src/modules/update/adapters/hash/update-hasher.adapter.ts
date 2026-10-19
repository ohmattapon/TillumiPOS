import { createHash } from 'node:crypto'
import { injectable } from 'tsyringe'
import type { IUpdateHasher } from '../../applications/ports/update-hasher.port'

/** SHA-256 over the package bytes, answered as lowercase hex. */
@injectable()
export class NodeUpdateHasher implements IUpdateHasher {
  sha256Hex(data: Uint8Array): string {
    return createHash('sha256').update(data).digest('hex')
  }
}
