import { describe, expect, test } from 'bun:test'
import { createDebouncedRunner } from './debounce'
import type { Timers } from './debounce'

// A hand-driven clock: nothing here waits for real time.
function fakeTimers() {
  let nextId = 1
  const pending = new Map<number, () => void>()
  const timers: Timers = {
    setTimeout: (callback) => {
      const id = nextId++
      pending.set(id, callback)
      return id
    },
    clearTimeout: (id) => {
      pending.delete(id as number)
    },
  }
  return {
    timers,
    pendingCount: () => pending.size,
    fireAll: () => {
      for (const [id, callback] of [...pending]) {
        pending.delete(id)
        callback()
      }
    },
  }
}

describe('createDebouncedRunner', () => {
  test('many schedules before the delay run once', () => {
    const clock = fakeTimers()
    let runs = 0
    const runner = createDebouncedRunner(() => runs++, 500, clock.timers)
    runner.schedule()
    runner.schedule()
    runner.schedule()
    expect(clock.pendingCount()).toBe(1)
    clock.fireAll()
    expect(runs).toBe(1)
  })

  test('nothing runs before the delay is over', () => {
    const clock = fakeTimers()
    let runs = 0
    createDebouncedRunner(() => runs++, 500, clock.timers).schedule()
    expect(runs).toBe(0)
  })

  test('flush runs a waiting call at once and the timer does not run it again', () => {
    const clock = fakeTimers()
    let runs = 0
    const runner = createDebouncedRunner(() => runs++, 500, clock.timers)
    runner.schedule()
    runner.flush()
    expect(runs).toBe(1)
    clock.fireAll()
    expect(runs).toBe(1)
  })

  test('flush with nothing waiting runs nothing', () => {
    const clock = fakeTimers()
    let runs = 0
    createDebouncedRunner(() => runs++, 500, clock.timers).flush()
    expect(runs).toBe(0)
  })

  test('it can be scheduled again after it ran', () => {
    const clock = fakeTimers()
    let runs = 0
    const runner = createDebouncedRunner(() => runs++, 500, clock.timers)
    runner.schedule()
    clock.fireAll()
    runner.schedule()
    clock.fireAll()
    expect(runs).toBe(2)
  })
})
