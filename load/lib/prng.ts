// A small seeded pseudo-random source, so the load data comes out the same on every run.

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

/** The helpers the seed draws from, all fed by one generator so the order of draws fixes the data. */
export function randomTools(seed: number) {
  const next = mulberry32(seed)
  const between = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  const chance = (probability: number) => next() < probability
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!
  const weighted = <T>(items: readonly (readonly [T, number])[]): T => {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0)
    let roll = next() * total
    for (const [item, weight] of items) {
      roll -= weight
      if (roll < 0) return item
    }
    return items[items.length - 1]![0]
  }
  return { next, between, chance, pick, weighted }
}

export type RandomTools = ReturnType<typeof randomTools>
