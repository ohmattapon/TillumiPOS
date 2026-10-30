export interface Timers {
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (handle: unknown) => void
}

const realTimers: Timers = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * Runs `run` once, `delayMs` after the last `schedule()`, so a burst of resize or move events
 * writes one file. `flush()` runs a waiting call at once (before the app quits). Timers are
 * passed in so a test can drive them by hand.
 */
export function createDebouncedRunner(run: () => void, delayMs: number, timers: Timers = realTimers) {
  let handle: unknown
  let waiting = false

  function cancel(): void {
    if (waiting) timers.clearTimeout(handle)
    waiting = false
  }

  return {
    schedule(): void {
      cancel()
      waiting = true
      handle = timers.setTimeout(() => {
        waiting = false
        run()
      }, delayMs)
    },
    flush(): void {
      if (!waiting) return
      cancel()
      run()
    },
  }
}
