import { describe, expect, test } from 'bun:test'
import { mulberry32 as bunGenerator } from '../../lib/prng'
import { mulberry32 as k6Generator } from './prng'

const take = (next: () => number, count: number) => Array.from({ length: count }, () => next())

describe('the k6 copy of mulberry32', () => {
  // k6 cannot import the Bun module, so the generator is copied; this keeps the two from drifting apart.
  test.each([0, 1, 42, 20261030, -7])('gives the same 1000 values as load/lib/prng.ts for seed %d', (seed) => {
    expect(take(k6Generator(seed), 1000)).toEqual(take(bunGenerator(seed), 1000))
  })
})
