// Which slot each virtual user of a scenario works, handed out by the runner. k6 numbers its virtual users across the
// whole test, and in a run of several scenarios the numbers of one scenario are neither contiguous nor predictable
// (measured on k6 v2.3.0: ids are given out as the VUs finish initialising, in no fixed order), so a VU cannot work
// out its own register from __VU. Instead each VU asks once for the next free slot of its scenario.

export type Claim = { slot: number } | { refused: 'full' | 'unknown' }

export interface SlotClaims {
  claim(scenario: string): Claim
}

/** Slots counted from 0 per scenario, at most `capacities[scenario]` of them in a run. */
export function createSlotClaims(capacities: Record<string, number>): SlotClaims {
  for (const [scenario, capacity] of Object.entries(capacities))
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error(`The capacity of ${scenario} must be a whole number of at least 1`)
  const taken = new Map<string, number>()
  return {
    claim(scenario) {
      const capacity = Object.hasOwn(capacities, scenario) ? capacities[scenario]! : undefined
      if (capacity === undefined) return { refused: 'unknown' }
      const next = taken.get(scenario) ?? 0
      if (next >= capacity) return { refused: 'full' }
      taken.set(scenario, next + 1)
      return { slot: next }
    },
  }
}
