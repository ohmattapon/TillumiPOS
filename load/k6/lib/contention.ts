// The pure parts of the contention scenarios (load/k6/scenarios/contention.ts): which registers each part works,
// how virtual users that cannot talk to each other agree on a moment and a key, and how the stock ledger proves
// that nothing was sold twice. Free of k6 imports, so Bun tests it (contention.test.ts).
import { idempotencyKeyFor } from './keys.ts'

/**
 * Registers of each part. The contention run opens one shift per entry, on registers 1..n of the seed, and the parts
 * run at the same time, so no two parts share a register. It runs on its own (never in the shop-day mix), so the
 * other selling scenarios never want these registers in the same run.
 *
 *  - hot: one till per virtual user selling the hot product
 *  - sameKey: the one till whose shift the five identical requests name
 *  - voidRace: the till the bills to void are sold on (in setup)
 *  - closeQr: the till whose shift is closed while a QR waits
 */
export const CONTENTION_PLAN = { hot: 4, sameKey: 1, voidRace: 1, closeQr: 1 } as const

export type ContentionPart = keyof typeof CONTENTION_PLAN

/** Virtual users of the parts: the hot tills, five identical requests, two voids of one bill, one closing shift. */
export const CONTENTION_VUS = { hot: CONTENTION_PLAN.hot, sameKey: 5, voidRace: 2, closeQr: 1 } as const
/** Sale attempts of each hot till: together far more than the 20 pieces a hot product can hold. */
export const HOT_ATTEMPTS = 12
export const SAME_KEY_ROUNDS = 5
export const VOID_ROUNDS = 5
/** Rounds are this far apart, so a round is over (and its replay sent) before the next one fires. */
export const ROUND_MS = 2_000

/** The `contention` tag of each part's checks, so a threshold can hold the exactly-one-winner checks to rate==1. */
export const HOT_TAG = 'hot'
export const SAME_KEY_TAG = 'same_key'
export const VOID_TAG = 'void'
export const CLOSE_QR_TAG = 'close_qr'

export function contentionTills(): number {
  return Object.values(CONTENTION_PLAN).reduce((total, count) => total + count, 0)
}

/** Splits the shifts setup opened (in register order) into the parts of CONTENTION_PLAN. */
export function splitSlots<T>(slots: T[]): Record<ContentionPart, T[]> {
  if (slots.length !== contentionTills()) throw new Error(`The contention run needs ${contentionTills()} tills, setup opened ${slots.length}`)
  let next = 0
  const take = (count: number) => slots.slice(next, (next += count))
  return { hot: take(CONTENTION_PLAN.hot), sameKey: take(CONTENTION_PLAN.sameKey), voidRace: take(CONTENTION_PLAN.voidRace), closeQr: take(CONTENTION_PLAN.closeQr) }
}

/**
 * The till of a virtual user, made from the scenario's own iteration counter rather than the global `__VU` (which k6
 * numbers across every scenario of the run). Called in the user's first iteration, which waits for a common start, so
 * the first iterations of the scenario go one to each user: the counter of that iteration is the user's index.
 */
export function claimTill(iterationInTest: number, iterationInScenario: number, tills: number): number {
  if (iterationInScenario !== 0) throw new Error('A till is claimed in the first iteration of a virtual user only')
  if (iterationInTest >= tills) throw new Error(`Iteration ${iterationInTest} claims a till, but the part has only ${tills} tills`)
  return iterationInTest
}

/** The Idempotency-Key of one round of a part: the same for every virtual user, so they send one key without talking. */
export function roundKey(part: string, round: number): string {
  return idempotencyKeyFor('contention', 0, round, part)
}

/** How long to sleep so that every virtual user fires round `round` at the same instant (`startAt + round * roundMs`). */
export function secondsUntilRound(startAt: number, round: number, roundMs: number, now: number): number {
  return Math.max(0, startAt + round * roundMs - now) / 1000
}

/** Sold + left must be the starting stock; any piece sold beyond it, or stock below zero, is overselling. */
export function tallyStock({ starting, remaining, sold }: { starting: number; remaining: number; sold: number }): { oversold: number; balanced: boolean } {
  return { oversold: Math.max(0, sold - starting, -remaining), balanced: sold + remaining === starting }
}

export interface Movement {
  id: number
  type: string
  reference: string | null
  quantity: number
}

/** What the stock ledger of one product says: pieces and bills, and bills that moved stock more than once of a kind. */
export function tallyMovements(movements: Movement[]) {
  const sales = new Map<string, number>()
  const voids = new Map<string, number>()
  let soldPieces = 0
  let returnedPieces = 0
  for (const movement of movements) {
    if (movement.type === 'sale') {
      soldPieces -= movement.quantity
      sales.set(movement.reference ?? '', (sales.get(movement.reference ?? '') ?? 0) + 1)
    } else if (movement.type === 'void') {
      returnedPieces += movement.quantity
      voids.set(movement.reference ?? '', (voids.get(movement.reference ?? '') ?? 0) + 1)
    }
  }
  const repeats = (counts: Map<string, number>) => [...counts.values()].reduce((total, count) => total + count - 1, 0)
  return { soldPieces, returnedPieces, saleBills: sales.size, voidBills: voids.size, repeatedSales: repeats(sales), repeatedVoids: repeats(voids) }
}

/**
 * The movements made after `afterId`, from a page of the ledger read newest first. Null when the page may have cut
 * some of them off (it is full and its oldest movement is still a new one), so a tally never misses a bill.
 */
export function movementsAfter(page: Movement[], afterId: number, limit: number): Movement[] | null {
  const fresh = page.filter((movement) => movement.id > afterId)
  if (page.length >= limit && fresh.length === page.length) return null
  return fresh
}
