import { randomInt } from 'node:crypto'
import type { IDisplayIdentifiers, IPairingGuard, PairingGuardCheck } from '../applications/ports/pairing-guard.port'

const MAX_FAILURES = 5
const LOCK_MS = 15 * 60_000

/** Failed tries per user, in memory: the same idea as the setup code's lock, kept per person. */
export class InMemoryPairingGuard implements IPairingGuard {
  private readonly failures = new Map<number, number>()
  private readonly lockedUntil = new Map<number, number>()

  /** `now` is injectable so a test can move the clock. */
  constructor(private readonly now: () => number = Date.now) {}

  check(userId: number): PairingGuardCheck {
    const until = this.lockedUntil.get(userId)
    if (until === undefined) return 'ok'
    if (this.now() < until) return 'locked'
    this.lockedUntil.delete(userId)
    return 'ok'
  }

  recordFailure(userId: number) {
    const failures = (this.failures.get(userId) ?? 0) + 1
    if (failures >= MAX_FAILURES) {
      this.lockedUntil.set(userId, this.now() + LOCK_MS)
      this.failures.delete(userId)
      return
    }
    this.failures.set(userId, failures)
  }

  recordSuccess(userId: number) {
    this.failures.delete(userId)
  }
}

/** The unguessable parts, from the platform's secure random source. */
export class CryptoDisplayIdentifiers implements IDisplayIdentifiers {
  newId() {
    return crypto.randomUUID()
  }

  newToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    return Buffer.from(bytes).toString('base64url')
  }

  newCode() {
    return String(randomInt(0, 1_000_000)).padStart(6, '0')
  }
}
