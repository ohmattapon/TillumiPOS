// The script k6 runs. The runner picks the profile and the scenario through the environment (see load/lib/k6.ts).
import { config } from './lib/config.ts'
import { closeShifts, openShifts, type ShiftSlot } from './lib/shifts.ts'
import { needsShifts, profileOptions, virtualUsers } from './profiles.ts'

export { catalog } from './scenarios/catalog.ts'
export { checkout } from './scenarios/checkout.ts'
export { orders } from './scenarios/orders.ts'

// config() also refuses a BASE_URL that is not this machine, before any request is made.
const { profile, scenario } = config()
export const options = profileOptions(profile, scenario)

/** Scenarios that sell get one open shift per virtual user; the others need no setup. */
export function setup(): ShiftSlot[] {
  return needsShifts(scenario) ? openShifts(virtualUsers(profile, scenario)) : []
}

export function teardown(slots: ShiftSlot[]) {
  closeShifts(slots)
}
