import { injectable } from 'tsyringe'
import type { IClock } from '../../shared/ports/clock.port'

/**
 * Settable clock for demo seeding. Live by default; the seeder pins it while
 * backdating history, because every memory repository stamps through IClock.
 * Freezing here backdates sales, stock movements and audit rows together
 * without any of them naming a date. The seeder must call resume() before
 * the server serves requests, so the till runs on live time afterwards.
 */
@injectable()
export class MemoryClock implements IClock {
  private frozenMs: number | null = null

  now(): Date {
    // Live time when unfrozen, the pinned instant when frozen: the same
    // single time source SystemClock is, so repositories need no other clock.
    return this.frozenMs === null ? new Date() : new Date(this.frozenMs)
  }

  /** Pin time at an epoch-millisecond instant; now() returns it until resume(). */
  freezeMs(atMs: number): void {
    this.frozenMs = atMs
  }

  /** Return to live time. */
  resume(): void {
    this.frozenMs = null
  }
}
