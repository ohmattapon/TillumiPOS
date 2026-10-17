import type { IPinGuard, PinGuardCheck } from '../applications/ports/pin-guard.port'

const MAX_FAILURES = 5
const LOCK_MS = 15 * 60_000

/**
 * Wrong PINs per target user, in memory: the same rule as the pairing guard, with its own counters.
 * One API instance only, like the customer display; a restart forgets the counts.
 */
export class InMemoryPinGuard implements IPinGuard {
  private readonly failures = new Map<number, number>()
  private readonly lockedUntil = new Map<number, number>()

  /** `now` is injectable so a test can move the clock. */
  constructor(private readonly now: () => number = Date.now) {}

  /** Synchronous on purpose: the check and the count happen together, with no await in between. */
  begin(userId: number): PinGuardCheck {
    const until = this.lockedUntil.get(userId)
    if (until !== undefined) {
      if (this.now() < until) return 'locked'
      this.lockedUntil.delete(userId)
    }
    const failures = (this.failures.get(userId) ?? 0) + 1
    if (failures >= MAX_FAILURES) {
      this.lockedUntil.set(userId, this.now() + LOCK_MS)
      this.failures.delete(userId)
    } else {
      this.failures.set(userId, failures)
    }
    return 'ok'
  }

  /** Also lifts a lock that this request's own attempt set: whoever got here knew the PIN. */
  recordSuccess(userId: number) {
    this.failures.delete(userId)
    this.lockedUntil.delete(userId)
  }

  /** For tests only: the singleton outlives a test, so each one starts clean. Not part of the port. */
  reset() {
    this.failures.clear()
    this.lockedUntil.clear()
  }
}
