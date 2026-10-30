// A copy of mulberry32 from load/lib/prng.ts: k6 cannot import a module written for Bun. prng.test.ts compares
// the two, so a change to one fails until the other follows.

/** Mulberry32: a 32-bit seeded generator returning values in [0, 1). Not for anything secret. */
export function mulberry32(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
