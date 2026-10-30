// Correctness under concurrent access. Four parts run at once as their own k6 scenarios (see profiles.ts), each on
// registers of its own (CONTENTION_PLAN in load/k6/lib/contention.ts):
//
//  - hotProduct: several tills sell the same hot product (1 to 20 in stock, sold nowhere else) until it is gone. The
//    refusals are 409 INSUFFICIENT_STOCK; teardown proves sold + left = the starting stock from the stock ledger.
//  - sameKey: five virtual users send the same sale with the same Idempotency-Key at the same instant. All five must
//    get the one sale, and the ledger must show one bill per key.
//  - voidRace: two virtual users void the same bill at the same instant (the bills are sold in setup). Exactly one
//    void wins, the other gets 409 ALREADY_VOIDED, and stock and points come back once.
//  - closeWithQr: a shift is closed while a QR waits: refused without acknowledgePendingQr, counted with it, then the
//    customer pays during the count and the close is refused until the shift is reopened and the money billed.
//
// How the virtual users agree without talking (k6 users share no memory): setup hands every user one instant,
// `startAt`. Round r of a part fires at startAt + r * ROUND_MS, and r is the user's own iteration number in its
// scenario (per-vu-iterations), so every user of the part fires round r together. The key of round r is derived from
// r alone (roundKey), so the five sameKey users send one key; the bill to void in round r is setup's r-th bill.
import { check, fail, sleep } from 'k6'
import exec from 'k6/execution'
import { Counter } from 'k6/metrics'
import { login, loginOwner } from '../lib/auth.ts'
import { api, type Session } from '../lib/client.ts'
import { config } from '../lib/config.ts'
import {
  CLOSE_QR_TAG,
  claimTill,
  CONTENTION_PLAN,
  contentionTills,
  CONTENTION_VUS,
  HOT_ATTEMPTS,
  HOT_TAG,
  movementsAfter,
  ROUND_MS,
  roundKey,
  SAME_KEY_ROUNDS,
  SAME_KEY_TAG,
  secondsUntilRound,
  splitSlots,
  tallyMovements,
  tallyStock,
  VOID_ROUNDS,
  VOID_TAG,
  type Movement,
} from '../lib/contention.ts'
import { idempotencyKeyFor } from '../lib/keys.ts'
import { closeShifts, loginForSlot, openShifts, type ShiftSlot } from '../lib/shifts.ts'
import { bank, refreshUntilPaid, type QrPayment } from './qr.ts'

/** Pieces sold beyond the stock there was, or a stock ledger that does not add up. Must stay 0. */
export const contentionOversold = new Counter('contention_oversold')
/** A second bill for one Idempotency-Key, or a bill voided (stock or points returned) twice. Must stay 0. */
export const contentionDuplicateSale = new Counter('contention_duplicate_sale')
/** Voids that answered 200; exactly one per raced bill. */
export const contentionVoidWins = new Counter('contention_void_wins')

/** Time for every user to sign in before the first round. */
const LEAD_MS = 5_000
/** A customer who does not pay the exact amount hands over a multiple of this (20 baht). */
const BANKNOTE_SATANG = 2000
const VOID_REASON = 'load test: void race'

interface Product {
  productId: number
  priceSatang: number
  /** The stock level setup read (for voidRace, before the bills were sold). */
  starting: number
  /** The newest stock movement of the product before the run; the tallies count the ones after it. */
  afterId: number
}

export interface ContentionData {
  /** Every shift setup opened, in register order; teardown closes them. */
  slots: ShiftSlot[]
  startAt: number
  hot: Product
  sameKey: Product
  voidRace: Product & { memberId: number; pointsBefore: number; saleIds: number[] }
  closeQr: { productId: number }
}

type Client = ReturnType<typeof api>

const cashFor = (totalSatang: number) => Math.ceil(totalSatang / BANKNOTE_SATANG) * BANKNOTE_SATANG

function readProduct(client: Client, productId: number): { trackStock: boolean; stockQty: number; priceSatang: number } {
  const response = client.get(`/api/v1/catalog/products/${productId}`, { expect: [200], name: 'contention.product' })
  if (response.status !== 200) fail(`reading product ${productId} answered ${response.status}`)
  return response.json()
}

const MOVEMENT_PAGE = 500

/** The newest page of a product's stock ledger (the API lists it newest first). */
function movementPage(client: Client, productId: number): Movement[] {
  const response = client.get(`/api/v1/inventory/movements?productId=${productId}&limit=${MOVEMENT_PAGE}&offset=0`, { expect: [200], name: 'contention.movements' })
  if (response.status !== 200) fail(`reading the movements of product ${productId} answered ${response.status}`)
  return response.json('items') as Movement[]
}

/** The id of the product's newest movement before the run; the seed's history (receipts, past bills) is older. */
function newestMovementId(client: Client, productId: number): number {
  return movementPage(client, productId)[0]?.id ?? 0
}

/** The movements this run made on the product. */
function readMovements(client: Client, product: Product): Movement[] {
  const fresh = movementsAfter(movementPage(client, product.productId), product.afterId, MOVEMENT_PAGE)
  if (fresh === null) fail(`product ${product.productId} has more than ${MOVEMENT_PAGE} new movements; the tally would miss some`)
  return fresh
}

function pointsOf(client: Client, memberId: number): number {
  const response = client.get(`/api/v1/members/${memberId}`, { expect: [200], name: 'contention.member' })
  if (response.status !== 200) fail(`reading member ${memberId} answered ${response.status}`)
  return response.json('pointsBalance') as number
}

/** One piece of the product, paid in cash; the seed prices include VAT, so the total is the price. */
function saleBody(product: Pick<Product, 'productId' | 'priceSatang'>, shiftId: number, memberId?: number) {
  return {
    items: [{ productId: product.productId, quantity: 1 }],
    ...(memberId === undefined ? {} : { memberId }),
    shiftId,
    payments: [{ method: 'cash', amountSatang: cashFor(product.priceSatang) }],
  }
}

/** The first tracked ordinary products: one whose bills are voided, one the five identical requests sell. */
function pickTrackedProducts(client: Client): { voidId: number; sameKeyId: number; otherId: number } {
  const tracked: number[] = []
  const { productIds } = config().seed
  for (const productId of productIds) {
    if (readProduct(client, productId).trackStock) tracked.push(productId)
    if (tracked.length === 2) break
  }
  if (tracked.length < 2) fail('the seed has fewer than two tracked ordinary products')
  const otherId = productIds.find((id) => !tracked.includes(id))
  if (otherId === undefined) fail('the seed has no ordinary product left for the QR sale')
  return { voidId: tracked[0]!, sameKeyId: tracked[1]!, otherId }
}

/** k6 setup for the contention run: the shifts, the starting stock and points, and the bills the void race voids. */
export function setupContention(): ContentionData {
  const slots = openShifts(contentionTills())
  try {
    const { seed } = config()
    const owner = api(loginOwner())
    const split = splitSlots(slots)
    const hotId = seed.hotProductIds[0]
    if (hotId === undefined) fail('the seed has no hot product')
    const memberId = seed.memberIds[0]
    if (memberId === undefined) fail('the seed has no member')
    const { voidId, sameKeyId, otherId } = pickTrackedProducts(owner)
    const product = (productId: number): Product => {
      const read = readProduct(owner, productId)
      return { productId, priceSatang: read.priceSatang, starting: read.stockQty, afterId: newestMovementId(owner, productId) }
    }
    const voidProduct = product(voidId)
    const pointsBefore = pointsOf(owner, memberId)

    const voidSlot = split.voidRace[0]!
    const seller = api(loginForSlot(voidSlot))
    const saleIds: number[] = []
    for (let round = 0; round < VOID_ROUNDS; round++) {
      const sold = seller.post('/api/v2/sales/', saleBody(voidProduct, voidSlot.shiftId, memberId), { expect: [200], name: 'contention.void-presale', idempotencyKey: roundKey('void-presale', round) })
      if (sold.status !== 200) fail(`selling the bill for void round ${round} answered ${sold.status}`)
      saleIds.push(sold.json('id') as number)
    }

    return {
      slots,
      startAt: Date.now() + LEAD_MS,
      hot: product(hotId),
      sameKey: product(sameKeyId),
      voidRace: { ...voidProduct, memberId, pointsBefore, saleIds },
      closeQr: { productId: otherId },
    }
  } catch (error) {
    // teardown does not run after a failed setup
    closeShifts(slots)
    throw error
  }
}

function waitForRound(data: ContentionData, round: number, offsetMs = 0) {
  sleep(secondsUntilRound(data.startAt + offsetMs, round, ROUND_MS, Date.now()))
}

// ---- hotProduct ----

let hotSession: Session | undefined
let hotSlot: ShiftSlot | undefined
/** Set once this user was told the hot product is gone: no piece comes back to it, so a later sale would be oversold. */
let soldOut = false

export function hotProduct(data: ContentionData) {
  if (!hotSlot) {
    hotSlot = splitSlots(data.slots).hot[claimTill(exec.scenario.iterationInTest, exec.vu.iterationInScenario, CONTENTION_PLAN.hot)]!
    hotSession = loginForSlot(hotSlot)
    waitForRound(data, 0)
  }
  const sold = api(hotSession!).post('/api/v2/sales/', saleBody(data.hot, hotSlot.shiftId), {
    expect: [200, 409],
    name: 'contention.hot-sale',
    idempotencyKey: idempotencyKeyFor('contention-hot', hotSlot.registerId, exec.vu.iterationInScenario, 'sale'),
  })
  if (sold.status === 200 && soldOut) contentionOversold.add(1)
  if (sold.status === 409 && sold.json('code') === 'INSUFFICIENT_STOCK') soldOut = true
  check(sold, { 'a hot sale is sold, or refused as out of stock': (res) => (res.status === 200 && res.json('status') === 'completed') || (res.status === 409 && res.json('code') === 'INSUFFICIENT_STOCK') }, { contention: HOT_TAG })
}

// ---- sameKey ----

let sameKeySession: Session | undefined

export function sameKey(data: ContentionData) {
  const round = exec.vu.iterationInScenario
  const slot = splitSlots(data.slots).sameKey[0]!
  sameKeySession ??= loginForSlot(slot)
  const client = api(sameKeySession)
  const body = saleBody(data.sameKey, slot.shiftId)
  const key = roundKey('same-key', round)

  waitForRound(data, round)
  const sold = client.post('/api/v2/sales/', body, { expect: [200], name: 'contention.same-key', idempotencyKey: key })
  const saleId = sold.status === 200 ? (sold.json('id') as number) : null
  check(sold, { 'every request of the key gets a completed sale': (res) => res.status === 200 && res.json('status') === 'completed' }, { contention: SAME_KEY_TAG })

  // Half a round later every user asks once more: the stored answer is the one bill, so a user that got another id saw a second bill.
  waitForRound(data, round, ROUND_MS / 2)
  const replayed = client.post('/api/v2/sales/', body, { expect: [200], name: 'contention.same-key.replay', idempotencyKey: key })
  const storedId = replayed.status === 200 ? (replayed.json('id') as number) : null
  if (saleId !== null && storedId !== null && saleId !== storedId) contentionDuplicateSale.add(1)
  check(replayed, { 'every request of the key got the one stored sale': (res) => res.status === 200 && saleId !== null && storedId === saleId }, { contention: SAME_KEY_TAG })
}

// ---- voidRace ----

let voidSession: Session | undefined

export function voidRace(data: ContentionData) {
  const round = exec.vu.iterationInScenario
  const saleId = data.voidRace.saleIds[round]
  if (saleId === undefined) fail(`void round ${round} has no bill: setup sold ${data.voidRace.saleIds.length}`)
  // Voiding needs sales.void, which the cashier role does not have. Each user sends its own key: one key would be a
  // replay of the first void rather than a second void racing it.
  voidSession ??= loginOwner()
  waitForRound(data, round)
  const voided = api(voidSession).post(`/api/v2/sales/${saleId}/void`, { reason: VOID_REASON }, { expect: [200, 409], name: 'contention.void', idempotencyKey: true })
  if (voided.status === 200) contentionVoidWins.add(1)
  check(voided, { 'a raced void wins, or is refused as already voided': (res) => (res.status === 200 && res.json('status') === 'voided') || (res.status === 409 && res.json('code') === 'ALREADY_VOIDED') }, { contention: VOID_TAG })
}

// ---- closeWithQr ----

export function closeWithQr(data: ContentionData) {
  const slot = splitSlots(data.slots).closeQr[0]!
  const session = loginForSlot(slot)
  const client = api(session)
  const tags = { contention: CLOSE_QR_TAG }
  const step = (name: string) => idempotencyKeyFor('contention-close-qr', slot.shiftId, exec.vu.iterationInScenario, name)
  const lines = [{ productId: data.closeQr.productId, quantity: 1 }]

  const quoted = client.post('/api/v1/quotes/', { lines }, { expect: [200], name: 'contention.qr-quote' })
  const quote = quoted.status === 200 ? (quoted.json() as { id: number; totalSatang: number }) : null
  if (!check(quote, { 'the QR cart is quoted': (q) => typeof q?.id === 'number' && q.totalSatang > 0 }, tags)) return
  const created = client.post('/api/v2/payments/qr/', { amountSatang: quote!.totalSatang, shiftId: slot.shiftId, quoteId: quote!.id }, { expect: [200], name: 'contention.qr-create', idempotencyKey: step('qr-create') })
  const payment = created.status === 200 ? (created.json() as QrPayment) : null
  if (!check(payment, { 'the QR waits for the customer': (made) => made?.status === 'pending' }, tags)) return

  let closingRevision: number | null = null
  let claimed = false
  try {
    const unacknowledged = client.post(`/api/v2/shifts/${slot.shiftId}/start-closing`, {}, { expect: [409], name: 'contention.start-closing.unacknowledged', idempotencyKey: step('start-closing-unacknowledged') })
    check(unacknowledged, { 'counting with a QR waiting needs the acknowledgement': (res) => res.status === 409 && res.json('code') === 'QR_PENDING_ACKNOWLEDGEMENT_REQUIRED' && res.json('params.count') === 1 }, tags)

    const started = client.post(`/api/v2/shifts/${slot.shiftId}/start-closing`, { acknowledgePendingQr: true }, { expect: [200], name: 'contention.start-closing', idempotencyKey: step('start-closing') })
    if (started.status === 200) closingRevision = started.json('closingRevision') as number
    const expectedCash = started.status === 200 ? (started.json('closingExpectedCashSatang') as number) : null
    if (!check(started, { 'acknowledged, the count starts': (res) => res.status === 200 && res.json('status') === 'closing' && typeof closingRevision === 'number' }, tags)) return

    // The customer pays while the drawer is counted.
    check(bank('pay', payment!.reference), { 'the fake bank takes the payment': (res) => res.status === 200 }, tags)
    const paid = refreshUntilPaid(client, payment!.id, tags)
    if (paid.status !== 'paid') return

    const closed = client.post(`/api/v2/shifts/${slot.shiftId}/close`, { closingRevision, countedCashSatang: expectedCash }, { expect: [409], name: 'contention.close.blocked', idempotencyKey: step('close-blocked') })
    check(closed, { 'money that arrived during the count blocks the close': (res) => res.status === 409 && res.json('code') === 'QR_PAYMENT_UNRESOLVED' }, tags)

    const reopened = client.post(`/api/v2/shifts/${slot.shiftId}/cancel-closing`, { closingRevision }, { expect: [200], name: 'contention.cancel-closing', idempotencyKey: step('cancel-closing') })
    if (!check(reopened, { 'the count is cancelled and the shift sells again': (res) => res.status === 200 && res.json('status') === 'open' }, tags)) return
    closingRevision = null

    const sold = client.post('/api/v2/sales/', { items: lines, quoteId: quote!.id, shiftId: slot.shiftId, payments: [{ method: 'promptpay', amountSatang: quote!.totalSatang, qrPaymentId: payment!.id }] }, { expect: [200], name: 'contention.qr-sale', idempotencyKey: step('qr-sale') })
    claimed = check(sold, { 'the money that came in during the count gets its bill': (res) => res.status === 200 && res.json('status') === 'completed' }, tags)
  } finally {
    // Leave the shift open with nothing waiting, so teardown can close it like every other shift.
    if (closingRevision !== null) client.post(`/api/v2/shifts/${slot.shiftId}/cancel-closing`, { closingRevision }, { expect: [200], name: 'contention.cleanup', idempotencyKey: step('cleanup-cancel-closing') })
    if (!claimed) releaseQr(client, payment!.id)
  }
}

/** Cancels a QR nobody paid; one that was paid but never billed is dismissed by the owner, who may. */
function releaseQr(client: Client, id: number) {
  const cancelled = client.post(`/api/v2/payments/qr/${id}/cancel`, undefined, { expect: [200, 409], name: 'contention.cleanup' })
  if (cancelled.status === 200) return
  api(loginOwner()).post(`/api/v2/payments/qr/${id}/dismiss`, { reason: 'load test: contention cleanup' }, { expect: [200], name: 'contention.cleanup' })
}

// ---- teardown ----

/** k6 teardown: proves from the stock ledger and the bills what the runs did, then closes every shift. */
export function teardownContention(data: ContentionData) {
  // Thresholds on a counter that never moved still need it to exist in the summary.
  contentionOversold.add(0)
  contentionDuplicateSale.add(0)
  contentionVoidWins.add(0)
  try {
    const owner = api(loginOwner())
    proveHot(owner, data)
    proveSameKey(owner, data)
    proveVoidRace(owner, data)
  } finally {
    closeShifts(data.slots)
  }
}

function proveHot(owner: Client, data: ContentionData) {
  const remaining = readProduct(owner, data.hot.productId).stockQty
  const sold = tallyMovements(readMovements(owner, data.hot)).soldPieces
  const { oversold, balanced } = tallyStock({ starting: data.hot.starting, remaining, sold })
  contentionOversold.add(oversold + (balanced ? 0 : 1))
  check(
    { remaining, sold, balanced },
    {
      'hot product: sold + left is the starting stock': (tally) => tally.balanced,
      'hot product: stock never went below zero': (tally) => tally.remaining >= 0,
      'hot product: the tills sold it out': (tally) => tally.remaining === 0,
    },
    { contention: HOT_TAG },
  )
}

function proveSameKey(owner: Client, data: ContentionData) {
  const remaining = readProduct(owner, data.sameKey.productId).stockQty
  const tally = tallyMovements(readMovements(owner, data.sameKey))
  contentionDuplicateSale.add(Math.max(0, tally.saleBills - SAME_KEY_ROUNDS) + tally.repeatedSales)
  check(
    { remaining, tally },
    {
      'same key: one bill per key': (seen) => seen.tally.saleBills === SAME_KEY_ROUNDS && seen.tally.repeatedSales === 0,
      'same key: the stock fell by one piece per key': (seen) => data.sameKey.starting - seen.remaining === SAME_KEY_ROUNDS,
    },
    { contention: SAME_KEY_TAG },
  )
}

function proveVoidRace(owner: Client, data: ContentionData) {
  const { voidRace } = data
  const remaining = readProduct(owner, voidRace.productId).stockQty
  const tally = tallyMovements(readMovements(owner, voidRace))
  const points = pointsOf(owner, voidRace.memberId)
  const statuses = voidRace.saleIds.map((id) => {
    const response = owner.get(`/api/v1/sales/${id}`, { expect: [200], name: 'contention.sale' })
    return response.status === 200 ? (response.json('status') as string) : null
  })
  contentionDuplicateSale.add(tally.repeatedVoids + Math.max(0, remaining - voidRace.starting) + (points === voidRace.pointsBefore ? 0 : 1))
  check(
    { remaining, tally, points, statuses },
    {
      'void race: every raced bill is voided': (seen) => seen.statuses.every((status) => status === 'voided'),
      'void race: each bill gave its stock back once': (seen) => seen.tally.voidBills === VOID_ROUNDS && seen.tally.repeatedVoids === 0 && seen.tally.returnedPieces === seen.tally.soldPieces,
      'void race: the stock is back where it started': (seen) => seen.remaining === voidRace.starting,
      'void race: the member points are back where they started': (seen) => seen.points === voidRace.pointsBefore,
    },
    { contention: VOID_TAG },
  )
}

const part = (name: string, vus: number, iterations: number) => ({ executor: 'per-vu-iterations' as const, exec: name, vus, iterations, maxDuration: '2m' })

/** The four parts, as k6 scenarios that run at once; the same in every profile, because this run is about correctness. */
export const options = {
  scenarios: {
    contention_hot: part('hotProduct', CONTENTION_VUS.hot, HOT_ATTEMPTS),
    contention_same_key: part('sameKey', CONTENTION_VUS.sameKey, SAME_KEY_ROUNDS),
    contention_void: part('voidRace', CONTENTION_VUS.voidRace, VOID_ROUNDS),
    contention_close_qr: part('closeWithQr', CONTENTION_VUS.closeQr, 1),
  },
  thresholds: {
    contention_oversold: ['count==0'],
    contention_duplicate_sale: ['count==0'],
    // Exactly one void wins per raced bill: two wins would be a double void, none a lost one.
    contention_void_wins: [`count==${VOID_ROUNDS}`],
    // These checks are the exactly-one-winner outcomes, too few for the 1% allowance of the common threshold.
    [`checks{contention:${HOT_TAG}}`]: ['rate==1'],
    [`checks{contention:${SAME_KEY_TAG}}`]: ['rate==1'],
    [`checks{contention:${VOID_TAG}}`]: ['rate==1'],
    [`checks{contention:${CLOSE_QR_TAG}}`]: ['rate==1'],
  },
}
