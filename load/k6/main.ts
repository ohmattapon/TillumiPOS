// The script k6 runs. The runner picks the profile and the scenario through the environment (see load/lib/k6.ts).
import { config } from './lib/config.ts'
import { closeShifts, openShifts, type ShiftSlot } from './lib/shifts.ts'
import { setupContention, teardownContention, type ContentionData } from './scenarios/contention.ts'
import { settleQrAttempts } from './scenarios/qr.ts'
import { needsShifts, profileOptions, registersFrom, virtualUsers } from './profiles.ts'

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
export const options = profileOptions(profile, scenario)

/** Scenarios that sell get one open shift per virtual user; the contention run sets up its own; the others need no setup. */
export function setup(): ShiftSlot[] | ContentionData {
  if (scenario === 'contention') return setupContention()
  return needsShifts(scenario) ? openShifts(virtualUsers(profile, scenario), registersFrom(scenario)) : []
}

export function teardown(data: ShiftSlot[] | ContentionData) {
  if (scenario === 'contention') return teardownContention(data as ContentionData)
  const slots = data as ShiftSlot[]
  // Unsettled QR requests would block a shift from closing.
  if (scenario === 'qr') settleQrAttempts(slots)
  closeShifts(slots)
}
