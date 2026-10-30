// Shifts for the scenarios that sell. The server runs in shift mode, so every sale needs an open shift, and a
// register holds only one open shift. `setup` opens one shift per virtual user, each on its own register, and
// `teardown` closes them all, so the test never leaves a shift open and a closed shift always has its summary.
import { check, fail } from 'k6'
import { Counter } from 'k6/metrics'
import { api, type Session } from './client.ts'
import { config } from './config.ts'
import { login } from './auth.ts'
import { idempotencyKeyFor } from './keys.ts'
import { openAllOrRollBack } from './rollback.ts'

/** Shifts that could not be closed in teardown; they stay open and block the next run on this database. */
export const shiftCloseFailed = new Counter('shift_close_failed')

/** Cash in the drawer when the shift opens. */
export const OPENING_CASH_SATANG = 100_000

/** One virtual user's till: who works it, on which register, in which shift. */
export interface ShiftSlot {
  username: string
  registerId: number
  shiftId: number
}

/** Opens a shift on the register and returns its id. The key depends on the register, so a retry does not open a second one. */
export function openShiftFor(session: Session, registerId: number): { shiftId: number } {
  const response = api(session).post(
    '/api/v2/shifts/',
    { registerId, openingCashSatang: OPENING_CASH_SATANG },
    { expect: [200], name: 'shift.open', idempotencyKey: idempotencyKeyFor(config().scenario, 0, registerId, 'shift-open') },
  )
  const shiftId = response.status === 200 ? (response.json('id') as number) : undefined
  if (typeof shiftId !== 'number') fail(`opening a shift on register ${registerId} answered ${response.status}`)
  return { shiftId }
}

/** Starts the count and closes the shift with exactly the cash the system expects, so it closes with no difference. */
export function closeShiftFor(session: Session, shiftId: number): boolean {
  const client = api(session)
  const starting = client.post(`/api/v2/shifts/${shiftId}/start-closing`, {}, { expect: [200], name: 'shift.start-closing', idempotencyKey: idempotencyKeyFor(config().scenario, 0, shiftId, 'shift-start-closing') })
  const expected = starting.status === 200 ? (starting.json('closingExpectedCashSatang') as number | null) : null
  const revision = starting.status === 200 ? (starting.json('closingRevision') as number) : null
  if (typeof expected !== 'number' || typeof revision !== 'number') return false
  const closing = client.post(
    `/api/v2/shifts/${shiftId}/close`,
    { closingRevision: revision, countedCashSatang: expected },
    { expect: [200], name: 'shift.close', idempotencyKey: idempotencyKeyFor(config().scenario, 0, shiftId, 'shift-close') },
  )
  return check(closing, { 'shift closes with no cash difference': (res) => res.status === 200 && res.json('status') === 'closed' && res.json('cashDifferenceSatang') === 0 })
}

/**
 * k6 `setup`: one till for each of the first `count` virtual users. User i works register i, and virtual user i+1
 * signs in as that same user, so a shift is always used by the person who opened it. If one cannot be opened, the
 * ones already open are closed first, because teardown does not run after a failed setup. `from` says which end of
 * the register list the tills are taken from: the QR scenario takes them from the end, the cash ones from the start.
 */
export function openShifts(count: number, from: 'start' | 'end' = 'start'): ShiftSlot[] {
  const { users, seed } = config()
  if (count > seed.registerIds.length) fail(`${count} virtual users need ${count} registers but the seed has ${seed.registerIds.length}; a register holds one open shift`)
  return openAllOrRollBack(
    count,
    (index) => {
      // 'end' counts from the last register and the last cashier, so a scenario placed there never meets one placed at the start.
      const user = users[(from === 'end' ? users.length - 1 - (index % users.length) : index % users.length)]!
      const registerId = seed.registerIds[from === 'end' ? seed.registerIds.length - 1 - index : index]!
      return { username: user.username, registerId, ...openShiftFor(login(user), registerId) }
    },
    (slot) => closeShifts([slot]),
  )
}

/** k6 `teardown`: closes every shift `openShifts` opened. One that fails is counted and the others are still closed. */
export function closeShifts(slots: ShiftSlot[]): void {
  for (const slot of slots) {
    let closed = false
    try {
      closed = closeShiftFor(loginForSlot(slot), slot.shiftId)
    } catch {
      // counted below; the remaining shifts still need closing
    }
    if (!closed) shiftCloseFailed.add(1)
  }
}

/** The till of the running virtual user, or a stop of the test when setup made none for it. */
export function slotOfThisVu(slots: ShiftSlot[]): ShiftSlot {
  const slot = slots[__VU - 1]
  if (!slot) fail(`virtual user ${__VU} has no till: setup opened ${slots.length}`)
  return slot
}

/** Signs the running virtual user in as the person who opened its shift. */
export function loginForSlot(slot: ShiftSlot): Session {
  return login(config().users.find((user) => user.username === slot.username)!)
}
