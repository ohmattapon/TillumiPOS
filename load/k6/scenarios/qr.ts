// PromptPay through the bank QR in shift mode: reserve a QR for a quote, poll its saved status, let the fake bank
// play the customer, ask the bank (refresh), then claim the paid QR in a sale. Two more cases run in rotation:
// the shop gives up on a QR (cancel), and the answer to "make a QR" is lost on its way back (an unknown outcome that
// is settled by asking the bank, after which the money still gets its bill).
//
// The bank is only ever the fake in server/test/kbank-server.ts; the customer is played through the control server
// the runner starts (FAKE_BANK_CONTROL_URL, see load/lib/fake-bank-control.ts).
//
// Registers: this scenario's tills are the LAST registers of the seed (profiles.ts `registers: 'end'`), and the cash
// scenarios take theirs from the first, so together they never want one register twice (cash tills + QR tills <= 10).
import { check, fail, sleep } from 'k6'
import http from 'k6/http'
import { pickCart } from '../lib/cart.ts'
import { api, type Session } from '../lib/client.ts'
import { config } from '../lib/config.ts'
import { idempotencyKeyFor } from '../lib/keys.ts'
import { isLocalBaseUrl } from '../lib/local-url.ts'
import { vuRandom } from '../lib/random.ts'
import { loginForSlot, slotOfThisVu, type ShiftSlot } from '../lib/shifts.ts'

export const options = {
  thresholds: {
    'http_req_duration{name:qr.create}': ['p(95)<800'],
    // The saved status is a pure read.
    'http_req_duration{name:qr.status}': ['p(95)<300'],
    'http_req_duration{name:qr.sale}': ['p(95)<800'],
  },
}

/** The API asks the bank about one QR at most every 3 seconds (QrPaymentRefresher), so a refresh waits a little longer. */
const REFRESH_WAIT_SECONDS = 3.2
const REFRESH_TRIES = 4
/** Of every five passes: one cancels, one loses the answer of the bank (user 1 only), and the other three pay. */
const PASSES = 5
const CANCEL_SLOT = 3
const UNKNOWN_SLOT = 4

interface QrPayment {
  id: number
  reference: string
  status: string
  saleId: number | null
  amountSatang: number
  qrRawData?: string
}

type Client = ReturnType<typeof api>
type Kind = 'pay' | 'cancel' | 'unknown'

let session: Session | undefined
let random: (() => number) | undefined

/** The customer's side, through the runner control server. */
function bank(action: string, argument: string) {
  const base = __ENV.FAKE_BANK_CONTROL_URL
  if (!base || !isLocalBaseUrl(base)) fail('FAKE_BANK_CONTROL_URL is not set to a local address; run this through bun load/run.ts')
  return http.request('POST', `${base}/${action}/${encodeURIComponent(argument)}`, null, { tags: { name: `bank.${action}` } })
}

function kindOf(iteration: number): Kind {
  const slot = iteration % PASSES
  if (slot === CANCEL_SLOT) return 'cancel'
  // Arming the fake bank is global, so only one user does it: another user QR would otherwise lose its answer.
  if (slot === UNKNOWN_SLOT && __VU === 1) return 'unknown'
  return 'pay'
}

export function qr(slots: ShiftSlot[]) {
  const slot = slotOfThisVu(slots)
  session ??= loginForSlot(slot)
  random ??= vuRandom('qr', __VU)
  const client = api(session)
  const { seed } = config()

  const cart = pickCart(random, seed)
  const quoted = client.post('/api/v1/quotes/', { lines: cart.items }, { expect: [200], name: 'qr.quote' })
  const quote = quoted.status === 200 ? quoted.json() : null
  if (!check(quote, { 'quote has an id and a total': (q) => typeof q?.id === 'number' && Number.isInteger(q.totalSatang) && q.totalSatang > 0 })) {
    sleep(1)
    return
  }
  const total = quote.totalSatang as number
  const kind = kindOf(__ITER)

  const payment = kind === 'unknown' ? requestLostQr(client, slot, quote.id, total) : requestQr(client, slot, quote.id, total)
  if (payment === null) {
    sleep(1)
    return
  }

  const status = client.get(`/api/v2/payments/qr/${payment.id}`, { expect: [200], name: 'qr.status' })
  const expectedStatus = kind === 'unknown' ? 'paid' : 'pending'
  check(status, { 'the saved status is what the bank last said': (res) => res.status === 200 && res.json('status') === expectedStatus })

  if (kind === 'cancel') cancelQr(client, payment)
  else {
    // The unknown case was paid at the bank before it was settled (see requestLostQr).
    if (kind === 'pay') check(bank('pay', payment.reference), { 'the fake bank takes the payment': (res) => res.status === 200 })
    const paid = kind === 'pay' ? refreshUntilPaid(client, payment.id) : payment
    claimInSale(client, slot, cart.items, quote.id, total, paid)
  }
  sleep(1)
}

/** Reserves a QR for the quote. */
function requestQr(client: Client, slot: ShiftSlot, quoteId: number, total: number): QrPayment | null {
  const created = client.post(
    '/api/v2/payments/qr/',
    { amountSatang: total, shiftId: slot.shiftId, quoteId },
    { expect: [200], name: 'qr.create', idempotencyKey: idempotencyKeyFor('qr', __VU, __ITER, 'qr-create') },
  )
  const body = created.status === 200 ? (created.json() as QrPayment) : null
  const good = check(body, {
    'QR is created pending with its payload and reference': (made) => made?.status === 'pending' && typeof made.reference === 'string' && made.reference !== '' && made.amountSatang === total && typeof made.qrRawData === 'string',
  })
  return good ? body : null
}

/**
 * The bank makes the QR but its answer is lost, so the API cannot know. The shop looks at the unsettled requests,
 * the customer pays the reference that request carries, and settling the request (which asks the bank) turns it into
 * a paid QR that still waits for its bill.
 */
function requestLostQr(client: Client, slot: ShiftSlot, quoteId: number, total: number): QrPayment | null {
  if (!check(bank('lose-next-create', 'true'), { 'the fake bank is told to lose the next answer': (res) => res.status === 200 })) return null
  const created = client.post(
    '/api/v2/payments/qr/',
    { amountSatang: total, shiftId: slot.shiftId, quoteId },
    { expect: [502], name: 'qr.create-lost', idempotencyKey: idempotencyKeyFor('qr', __VU, __ITER, 'qr-create') },
  )
  const attemptId = created.status === 502 ? (created.json('params.attemptId') as number) : undefined
  if (!check(created, { 'a lost answer is reported as unresolved, with the attempt': (res) => res.status === 502 && res.json('code') === 'QR_PAYMENT_UNRESOLVED' && typeof attemptId === 'number' })) return null

  const attempts = client.get('/api/v2/payments/qr/attempts', { expect: [200], name: 'qr.attempts' })
  const attempt = attempts.status === 200 ? (attempts.json('items') as { id: number; reference: string }[]).find((item) => item.id === attemptId) : undefined
  if (!check(attempt, { 'the unsettled request is listed': (item) => item !== undefined })) return null

  check(bank('pay', attempt!.reference), { 'the fake bank takes the payment': (res) => res.status === 200 })
  const settled = client.post(`/api/v2/payments/qr/attempts/${attemptId}/resolve`, undefined, { expect: [200], name: 'qr.resolve' })
  const qrPaymentId = settled.status === 200 ? (settled.json('qrPaymentId') as number | null) : null
  if (!check(settled, { 'settling the request finds the payment': (res) => res.status === 200 && typeof qrPaymentId === 'number' })) return null

  const recovered = client.get(`/api/v2/payments/qr/${qrPaymentId}`, { expect: [200], name: 'qr.status' })
  const body = recovered.status === 200 ? (recovered.json() as QrPayment) : null
  return check(body, { 'the settled payment is paid and not yet claimed': (found) => found?.status === 'paid' && found.saleId === null }) ? body : null
}

/** Asks the bank until the payment shows up; the API passes on a refresh that comes sooner than 3 seconds after the last. */
function refreshUntilPaid(client: Client, id: number): QrPayment {
  let latest: QrPayment | null = null
  for (let attempt = 0; attempt < REFRESH_TRIES; attempt++) {
    sleep(REFRESH_WAIT_SECONDS)
    const refreshed = client.post(`/api/v2/payments/qr/${id}/refresh`, undefined, { expect: [200], name: 'qr.refresh' })
    latest = refreshed.status === 200 ? (refreshed.json() as QrPayment) : null
    if (latest?.status === 'paid') break
  }
  check(latest, { 'the bank confirms the payment on refresh': (found) => found?.status === 'paid' })
  return latest ?? ({ id, status: 'pending' } as QrPayment)
}

function cancelQr(client: Client, payment: QrPayment) {
  const cancelled = client.post(`/api/v2/payments/qr/${payment.id}/cancel`, undefined, { expect: [200], name: 'qr.cancel' })
  check(cancelled, { 'an unpaid QR is cancelled': (res) => res.status === 200 && res.json('status') === 'cancelled' })
  const after = client.get(`/api/v2/payments/qr/${payment.id}`, { expect: [200], name: 'qr.status' })
  check(after, { 'the cancelled QR stays cancelled': (res) => res.status === 200 && res.json('status') === 'cancelled' && res.json('saleId') === null })
}

/** Sells the quote cart with the paid QR as the payment. */
function claimInSale(client: Client, slot: ShiftSlot, items: { productId: number; quantity: number }[], quoteId: number, total: number, paid: QrPayment) {
  if (paid.status !== 'paid') return
  const sold = client.post(
    '/api/v2/sales/',
    { items, quoteId, shiftId: slot.shiftId, payments: [{ method: 'promptpay', amountSatang: total, qrPaymentId: paid.id }] },
    { expect: [200], name: 'qr.sale', idempotencyKey: idempotencyKeyFor('qr', __VU, __ITER, 'sale') },
  )
  check(sold, {
    'the QR sale is completed with the quoted total': (res) => res.status === 200 && res.json('status') === 'completed' && res.json('totalSatang') === total,
    'the QR sale is in this till shift': (res) => res.status === 200 && res.json('shiftId') === slot.shiftId,
  })
  const saleId = sold.status === 200 ? (sold.json('id') as number) : null
  const claimed = client.get(`/api/v2/payments/qr/${paid.id}`, { expect: [200], name: 'qr.status' })
  check(claimed, { 'the paid QR now points at its bill': (res) => res.status === 200 && res.json('status') === 'paid' && saleId !== null && res.json('saleId') === saleId })
}
