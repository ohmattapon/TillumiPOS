import { injectable } from 'tsyringe'
import type { IPasswordHasher } from '../ports/password-hasher.port'

@injectable()
export class BunPasswordHasher implements IPasswordHasher {
  hash(plain: string) {
    return Bun.password.hash(plain)
  }

  verify(plain: string, hash: string) {
    return Bun.password.verify(plain, hash)
  }
}
