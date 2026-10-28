import { describe, expect, spyOn, test } from 'bun:test'
import {
  createSlidesPoller,
  nextSlideIndex,
  nextVisibleIndex,
  parseSlidesResponse,
  prevSlideIndex,
  type DisplaySlide,
} from './slideshow'

describe('nextSlideIndex', () => {
  test('moves forward and wraps around to the start', () => {
    expect(nextSlideIndex(0, 3)).toBe(1)
    expect(nextSlideIndex(1, 3)).toBe(2)
    expect(nextSlideIndex(2, 3)).toBe(0)
  })

  test('a single picture stays put instead of rotating', () => {
    expect(nextSlideIndex(0, 1)).toBe(0)
  })

  test('an empty list has no next picture', () => {
    expect(nextSlideIndex(0, 0)).toBeNull()
    expect(nextSlideIndex(0, -1)).toBeNull()
  })
})

describe('prevSlideIndex', () => {
  test('moves back and wraps around to the end', () => {
    expect(prevSlideIndex(0, 3)).toBe(2)
    expect(prevSlideIndex(2, 3)).toBe(1)
  })

  test('a single picture stays put instead of rotating', () => {
    expect(prevSlideIndex(0, 1)).toBe(0)
  })

  test('an empty list has no previous picture', () => {
    expect(prevSlideIndex(0, 0)).toBeNull()
  })
})

describe('nextVisibleIndex', () => {
  test('skips pictures that failed to load', () => {
    expect(nextVisibleIndex(0, 3, new Set([1]))).toBe(2)
    expect(nextVisibleIndex(1, 3, new Set([2]))).toBe(0)
  })

  test('returns null when every picture failed, so the screen falls back instead of going white', () => {
    expect(nextVisibleIndex(0, 2, new Set([0, 1]))).toBeNull()
  })

  test('returns null for an empty list', () => {
    expect(nextVisibleIndex(0, 0, new Set())).toBeNull()
  })
})

describe('parseSlidesResponse', () => {
  const payload = (items: unknown) => ({ items, total: Array.isArray(items) ? items.length : 0 })

  test('keeps id and image URL in order and drops fields it does not know', () => {
    const parsed = parseSlidesResponse(
      payload([
        { id: 2, imageUrl: '/media/slides/b.png', sortOrder: 0, isActive: true, costSatang: 3000 },
        { id: 1, imageUrl: '/media/slides/a.png', sortOrder: 1, isActive: true },
      ]),
    )
    expect(parsed).toEqual([
      { id: 2, imageUrl: '/media/slides/b.png' },
      { id: 1, imageUrl: '/media/slides/a.png' },
    ])
  })

  test('skips entries without a usable image instead of breaking the whole screen', () => {
    const parsed = parseSlidesResponse(
      payload([
        { id: 1, imageUrl: '/media/slides/a.png', sortOrder: 0, isActive: true },
        { id: 2, imageUrl: null, sortOrder: 1, isActive: true },
        { id: 3, sortOrder: 2, isActive: true },
        { id: 'x', imageUrl: '/media/slides/d.png', sortOrder: 3, isActive: true },
        'poster',
      ]),
    )
    expect(parsed).toEqual([{ id: 1, imageUrl: '/media/slides/a.png' }])
  })

  test('an empty or malformed payload means no carousel, not a crash', () => {
    expect(parseSlidesResponse(payload([]))).toEqual([])
    expect(parseSlidesResponse({})).toEqual([])
    expect(parseSlidesResponse(null)).toEqual([])
    expect(parseSlidesResponse({ items: 'posters' })).toEqual([])
  })
})

describe('createSlidesPoller', () => {
  const tick = () => Bun.sleep(0)

  const fakeScheduler = () => {
    const runs: Array<() => void> = []
    let cleared = 0
    return {
      runs,
      get cleared() {
        return cleared
      },
      scheduler: {
        set: (run: () => void) => {
          runs.push(run)
          return runs.length
        },
        clear: () => {
          cleared += 1
        },
      },
    }
  }

  const slide = (id: number): DisplaySlide => ({ id, imageUrl: `/media/slides/${id}.png` })

  test('fetches once right away, then again on every poll', async () => {
    const fake = fakeScheduler()
    const seen: Array<readonly DisplaySlide[]> = []
    let calls = 0
    const poller = createSlidesPoller({
      fetchSlides: async () => {
        calls += 1
        return [slide(calls)]
      },
      onSlides: (slides) => seen.push(slides),
      pollMs: 60_000,
      scheduler: fake.scheduler,
    })
    await tick()
    expect(calls).toBe(1)
    expect(seen).toEqual([[slide(1)]])

    fake.runs[0]!()
    await tick()
    expect(calls).toBe(2)
    expect(seen).toEqual([[slide(1)], [slide(2)]])
    poller.stop()
    expect(fake.cleared).toBe(1)
  })

  test('a failed fetch keeps the last pictures until the next poll', async () => {
    const fake = fakeScheduler()
    const seen: Array<readonly DisplaySlide[]> = []
    let fail = true
    const poller = createSlidesPoller({
      fetchSlides: async () => {
        if (fail) throw new Error('offline')
        return [slide(7)]
      },
      onSlides: (slides) => seen.push(slides),
      pollMs: 60_000,
      scheduler: fake.scheduler,
    })
    await tick()
    expect(seen).toEqual([])

    fail = false
    fake.runs[0]!()
    await tick()
    expect(seen).toEqual([[slide(7)]])
    poller.stop()
  })

  test('stop ends polling without another fetch', async () => {
    const fake = fakeScheduler()
    let calls = 0
    const poller = createSlidesPoller({
      fetchSlides: async () => {
        calls += 1
        return []
      },
      onSlides: () => {},
      pollMs: 60_000,
      scheduler: fake.scheduler,
    })
    await tick()
    expect(calls).toBe(1)
    poller.stop()
    fake.runs[0]!()
    await tick()
    expect(calls).toBe(1)
  })

  test('without an injected scheduler the poll is a real interval that stop() clears', async () => {
    const set = spyOn(globalThis, 'setInterval').mockImplementation((() => 7) as unknown as typeof setInterval)
    const cleared = spyOn(globalThis, 'clearInterval').mockImplementation(() => {})
    try {
      const poller = createSlidesPoller({ fetchSlides: async () => [], onSlides: () => {}, pollMs: 1234 })

      poller.stop()

      expect(set).toHaveBeenCalledWith(expect.any(Function), 1234)
      expect(cleared).toHaveBeenCalledWith(7)
    } finally {
      set.mockRestore()
      cleared.mockRestore()
    }
  })
})
