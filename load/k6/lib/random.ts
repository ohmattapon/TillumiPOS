import { fnv1a } from './keys.ts'
import { mulberry32 } from './prng.ts'

/** The random source of one virtual user in one scenario: the same sequence on every run, different for each user. */
export function vuRandom(scenario: string, vu: number): () => number {
  return mulberry32(fnv1a(`${scenario}:${vu}`, 0))
}
