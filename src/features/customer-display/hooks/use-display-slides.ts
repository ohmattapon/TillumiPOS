import { useEffect, useRef, useState } from 'react'
import { fetchDisplaySlides } from '../api'
import {
  createSlidesPoller,
  nextVisibleIndex,
  parseSlidesResponse,
  SLIDES_ADVANCE_MS,
  SLIDES_POLL_MS,
  type DisplaySlide,
  type IntervalScheduler,
} from '../lib/slideshow'

export interface DisplaySlidesDeps {
  /** Asks for the current pictures; the public endpoint, parsed, by default. */
  fetchSlides?: () => Promise<readonly DisplaySlide[]>
  pollMs?: number
  advanceMs?: number
  /** Fires polls and advances; injected so tests drive time by hand. */
  scheduler?: IntervalScheduler
}

const defaultFetch = async (): Promise<DisplaySlide[]> => parseSlidesResponse(await fetchDisplaySlides())

/**
 * The pictures beside the sale state, never inside it: fetched once on mount, re-polled every
 * minute, advancing quietly every few seconds. A failed picture is skipped, never shown white.
 */
export function useDisplaySlides(deps: DisplaySlidesDeps = {}) {
  const { fetchSlides = defaultFetch, pollMs = SLIDES_POLL_MS, advanceMs = SLIDES_ADVANCE_MS, scheduler } = deps
  const [slides, setSlides] = useState<readonly DisplaySlide[]>([])
  const [index, setIndex] = useState(0)
  const [broken, setBroken] = useState<ReadonlySet<number>>(() => new Set())
  const live = useRef({ slides, broken })
  useEffect(() => {
    live.current = { slides, broken }
  })

  useEffect(() => {
    const poller = createSlidesPoller({
      fetchSlides,
      pollMs,
      scheduler,
      onSlides: (next) => {
        const prev = live.current.slides
        const same = prev.length === next.length && prev.every((slide, at) => slide.id === next[at]?.id)
        if (same) return
        live.current.slides = next
        setSlides(next)
        setBroken(new Set())
        setIndex(0)
      },
    })
    return () => poller.stop()
  }, [fetchSlides, pollMs, scheduler])

  useEffect(() => {
    if (slides.length < 2) return
    const set = scheduler?.set ?? ((run: () => void, ms: number) => setInterval(run, ms))
    const clear = scheduler?.clear ?? ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>))
    const id = set(() => {
      const { slides: current, broken: failed } = live.current
      setIndex((at) => nextVisibleIndex(at, current.length, failed) ?? at)
    }, advanceMs)
    return () => clear(id)
  }, [slides.length, advanceMs, scheduler])

  /** Marks one position as failed to load; the screen moves on to the next picture. */
  const markBroken = (failed: number) => {
    setBroken((prev) => (prev.has(failed) ? prev : new Set(prev).add(failed)))
  }

  const count = slides.length
  const at = count === 0 ? null : index % count
  const position = at === null || broken.has(at) ? (at === null ? null : nextVisibleIndex(at, count, broken)) : at

  return { slides, index: position, current: position === null ? null : (slides[position] ?? null), markBroken }
}
