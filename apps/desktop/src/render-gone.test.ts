import { describe, expect, test } from 'bun:test'
import { shouldReopenShop } from './render-gone'

describe('shouldReopenShop', () => {
  test('a clean exit is left alone', () => {
    expect(shouldReopenShop('clean-exit')).toBe(false)
  })

  test.each(['abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction'] as const)(
    'reopens the shop after %s',
    (reason) => {
      expect(shouldReopenShop(reason)).toBe(true)
    },
  )
})
