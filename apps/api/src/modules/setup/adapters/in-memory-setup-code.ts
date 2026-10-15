import { timingSafeEqual } from 'node:crypto'
import type { ISetupCode, SetupCodeCheck } from '../applications/ports/setup-code.port'

// No 0/O, 1/I/L: the code is read off a log and typed by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const LENGTH = 12
const MAX_FAILURES = 5
const LOCK_MS = 15 * 60_000

export class InMemorySetupCode implements ISetupCode {
  private code: string | null = null
  private failures = 0
  private lockedUntil = 0

  /** `now` is injectable so a test can move the clock. */
  constructor(private readonly now: () => number = Date.now) {}

  issue() {
    const bytes = crypto.getRandomValues(new Uint8Array(LENGTH))
    this.code = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')
    this.failures = 0
    this.lockedUntil = 0
    return this.code
  }

  verify(candidate: string): SetupCodeCheck {
    if (this.code === null) return 'not-issued'
    if (this.now() < this.lockedUntil) return 'locked'

    const given = Buffer.from(candidate.trim().toUpperCase())
    const expected = Buffer.from(this.code)
    // Compared in constant time: a wrong length is simply wrong.
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      this.failures = 0
      return 'accepted'
    }

    this.failures++
    if (this.failures >= MAX_FAILURES) {
      this.lockedUntil = this.now() + LOCK_MS
      this.failures = 0
    }
    return 'wrong'
  }

  retire() {
    this.code = null
    this.failures = 0
    this.lockedUntil = 0
  }
}
