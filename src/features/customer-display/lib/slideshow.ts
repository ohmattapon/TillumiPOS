/** One marketing picture the customer display shows; the server already filters and orders them. */
export interface DisplaySlide {
  readonly id: number
  readonly imageUrl: string
}

/** How often the display asks for the latest pictures; the list changes only when the owner edits it. */
export const SLIDES_POLL_MS = 60_000
/** How long one picture stays before the next fades in. */
export const SLIDES_ADVANCE_MS = 8_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Builds a clean list from untrusted data. Entries without a usable image are skipped and anything
 * unknown is left behind, so one bad row never takes the whole screen down. The server order is kept.
 */
export function parseSlidesResponse(raw: unknown): DisplaySlide[] {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return []
  const slides: DisplaySlide[] = []
  for (const item of raw.items) {
    if (!isRecord(item)) continue
    const { id, imageUrl } = item
    if (typeof id !== 'number' || !Number.isSafeInteger(id)) continue
    if (typeof imageUrl !== 'string' || imageUrl === '') continue
    slides.push({ id, imageUrl })
  }
  return slides
}

/** The next position, wrapping around to the start; null when there is nothing to show. */
export function nextSlideIndex(current: number, count: number): number | null {
  if (count <= 0) return null
  if (count === 1) return 0
  return (current + 1) % count
}

/** The previous position, wrapping around to the end; null when there is nothing to show. */
export function prevSlideIndex(current: number, count: number): number | null {
  if (count <= 0) return null
  if (count === 1) return 0
  return (current - 1 + count) % count
}

/**
 * The next position whose picture loaded, wrapping around; null when every picture failed (or the
 * list is empty), so the screen can fall back to its welcome text instead of showing white.
 */
export function nextVisibleIndex(current: number, count: number, broken: ReadonlySet<number>): number | null {
  if (count <= 0) return null
  for (let step = 1; step <= count; step += 1) {
    const candidate = (current + step) % count
    if (!broken.has(candidate)) return candidate
  }
  return null
}

/** Repeating timer, injected so tests fire polls and advances by hand instead of waiting. */
export interface IntervalScheduler {
  set(run: () => void, ms: number): unknown
  clear(id: unknown): void
}

const systemIntervals: IntervalScheduler = {
  set: (run, ms) => setInterval(run, ms),
  clear: (id) => clearInterval(id as ReturnType<typeof setInterval>),
}

export interface SlidesPollerOptions {
  /** Asks the server for the current pictures; a rejection only skips this round. */
  fetchSlides: () => Promise<readonly DisplaySlide[]>
  onSlides: (slides: readonly DisplaySlide[]) => void
  pollMs?: number
  scheduler?: IntervalScheduler
}

export interface SlidesPoller {
  stop(): void
}

/** Fetches once right away, then on every poll. A failed round keeps the last pictures. */
export function createSlidesPoller({
  fetchSlides,
  onSlides,
  pollMs = SLIDES_POLL_MS,
  scheduler = systemIntervals,
}: SlidesPollerOptions): SlidesPoller {
  let stopped = false
  const load = () => {
    if (stopped) return
    fetchSlides().then(
      (slides) => {
        if (!stopped) onSlides(slides)
      },
      () => {
        // Keep showing the last pictures; the next poll retries.
      },
    )
  }
  load()
  const id = scheduler.set(() => load(), pollMs)
  return {
    stop: () => {
      stopped = true
      scheduler.clear(id)
    },
  }
}
