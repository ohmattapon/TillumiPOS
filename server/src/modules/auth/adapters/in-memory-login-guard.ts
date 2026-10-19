import type { ILoginAttemptGuard, LoginAttemptCheck } from '../applications/ports/login-attempt-guard.port'

const MAX_FAILURES = 5
const LOCK_MS = 15 * 60_000
/** Usernames are unbounded (unlike user ids), so the map must not grow without limit. */
const MAX_TRACKED_USERNAMES = 10_000

/**
 * Failed logins per normalized username, in memory: the same rule as the PIN guard, keyed by name.
 * One API instance only; a restart forgets the counts.
 */
export class InMemoryLoginGuard implements ILoginAttemptGuard {
  private readonly failures = new Map<string, number>()
  private readonly lockedUntil = new Map<string, number>()

  /** `now` is injectable so a test can move the clock. */
  constructor(private readonly now: () => number = Date.now) {}

  /** Synchronous on purpose: the check and the count happen together, with no await in between. */
  begin(username: string): LoginAttemptCheck {
    const until = this.lockedUntil.get(username)
    if (until !== undefined) {
      if (this.now() < until) return 'locked'
      this.lockedUntil.delete(username)
    }
    const failures = (this.failures.get(username) ?? 0) + 1
    if (failures >= MAX_FAILURES) {
      this.lockedUntil.set(username, this.now() + LOCK_MS)
      this.failures.delete(username)
    } else {
      this.failures.set(username, failures)
      if (this.failures.size > MAX_TRACKED_USERNAMES) {
        const oldest = this.failures.keys().next()
        if (!oldest.done) this.failures.delete(oldest.value)
      }
    }
    return 'ok'
  }

  /** Also lifts a lock that this request's own attempt set: whoever got here knew the password. */
  recordSuccess(username: string) {
    this.failures.delete(username)
    this.lockedUntil.delete(username)
  }

  /** For tests only: the singleton outlives a test, so each one starts clean. Not part of the port. */
  reset() {
    this.failures.clear()
    this.lockedUntil.clear()
  }
}
