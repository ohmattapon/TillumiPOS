// The script k6 runs. The runner picks the profile and the scenario through the environment (see load/lib/k6.ts).
import { config } from './lib/config.ts'
import { tillsFor } from './lib/mix.ts'
import { closeShifts, openTills, type ShiftSlot } from './lib/shifts.ts'
import { setupContention, teardownContention, type ContentionData } from './scenarios/contention.ts'
import { settleQrAttempts } from './scenarios/qr.ts'
import { profileOptions } from './profiles.ts'

export { auth, authLock } from './scenarios/auth.ts'
export { catalog } from './scenarios/catalog.ts'
export { checkout } from './scenarios/checkout.ts'
export { closeWithQr, hotProduct, sameKey, voidRace } from './scenarios/contention.ts'
export { display } from './scenarios/display.ts'
export { members } from './scenarios/members.ts'
export { orders } from './scenarios/orders.ts'
export { qr } from './scenarios/qr.ts'
export { reports } from './scenarios/reports.ts'
export { stock } from './scenarios/stock.ts'

// config() also refuses a BASE_URL that is not this machine, before any request is made.
const { profile, scenario } = config()
export const options = profileOptions(profile, scenario, __ENV)

/** Every till of the selling scenarios in the run gets its shift here (one per allotted register); the contention run sets up its own. */
export function setup(): ShiftSlot[] | ContentionData {
  if (scenario === 'contention') return setupContention()
  return openTills(tillsFor(profile, scenario))
}

export function teardown(data: ShiftSlot[] | ContentionData) {
  if (scenario === 'contention') return teardownContention(data as ContentionData)
  const slots = data as ShiftSlot[]
  // Unsettled QR requests would block a shift from closing.
  settleQrAttempts(slots.filter((slot) => slot.scenario === 'qr'))
  closeShifts(slots)
}
