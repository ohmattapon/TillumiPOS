const FIRST_DELAY_MS = 1000
const MAX_DELAY_MS = 10_000

/** Delay before retry number `attempt` (0 is the first retry): doubles from 1 s and stops at 10 s. */
export function nextDelayMs(attempt: number): number {
  // `!(attempt > 0)` also catches NaN, which a plain `<` would let through.
  if (!(attempt > 0)) return FIRST_DELAY_MS
  // 2 ** 1024 is Infinity, which the cap absorbs, so a huge count needs no special case.
  return Math.min(MAX_DELAY_MS, FIRST_DELAY_MS * 2 ** Math.floor(attempt))
}
