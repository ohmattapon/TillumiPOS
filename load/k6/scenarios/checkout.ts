// One-step sales in shift mode: price the cart with a quote, then sell it with cash. Every till has its own register
// and shift (opened in setup, closed in teardown), and every sale carries its own Idempotency-Key.
//
// Cash only: once the bank is configured a PromptPay payment needs a QR the bank has confirmed, and the QR flow
// has its own scenario.
import { check, sleep } from 'k6'
import { pickCart } from '../lib/cart.ts'
import { api, type Session } from '../lib/client.ts'
import { config } from '../lib/config.ts'
import { idempotencyKeyFor } from '../lib/keys.ts'
import { splitMembers } from '../lib/member-slices.ts'
import { vuRandom } from '../lib/random.ts'
import { loginForSlot, slotOfThisVu, type ShiftSlot } from '../lib/shifts.ts'

export { openShiftFor } from '../lib/shifts.ts'

export const options = {
  thresholds: {
    // A quote is a POST that only reads and prices, so it gets the read limit.
    'http_req_duration{name:checkout.quote}': ['p(95)<300'],
    'http_req_duration{name:checkout.sale}': ['p(95)<800'],
  },
}

const MEMBER_SHARE = 0.3
const BANKNOTE_SHARE = 0.4
/** A customer who does not pay the exact amount hands over a multiple of this (20 baht). */
const BANKNOTE_SATANG = 2000

let session: Session | undefined
let random: (() => number) | undefined

export function checkout(slots: ShiftSlot[]) {
  const slot = slotOfThisVu(slots)
  session ??= loginForSlot(slot)
  random ??= vuRandom('checkout', __VU)
  const { seed } = config()
  const client = api(session)
  const { selling } = splitMembers(seed.memberIds)

  const cart = pickCart(random, seed)
  // The last members are reserved for the members scenario, whose point balances must not move under it.
  const memberId = random() < MEMBER_SHARE ? selling[Math.floor(random() * selling.length)]! : null
  const tendersBanknote = random() < BANKNOTE_SHARE

  const quoted = client.post('/api/v1/quotes/', { lines: cart.items, ...(memberId === null ? {} : { memberId }) }, { expect: [200], name: 'checkout.quote' })
  const quote = quoted.status === 200 ? quoted.json() : null
  if (!check(quote, { 'quote has an id and a total': (q) => typeof q?.id === 'number' && Number.isInteger(q.totalSatang) && q.totalSatang > 0 })) {
    sleep(1)
    return
  }

  const total = quote.totalSatang as number
  const tendered = tendersBanknote ? Math.ceil(total / BANKNOTE_SATANG) * BANKNOTE_SATANG : total
  const sold = client.post(
    '/api/v2/sales/',
    {
      items: cart.items,
      ...(memberId === null ? {} : { memberId }),
      quoteId: quote.id,
      shiftId: slot.shiftId,
      payments: [{ method: 'cash', amountSatang: tendered }],
    },
    { expect: [200], name: 'checkout.sale', idempotencyKey: idempotencyKeyFor('checkout', __VU, __ITER, 'sale') },
  )
  check(sold, {
    'sale is completed with the quoted total': (res) => res.status === 200 && res.json('status') === 'completed' && res.json('totalSatang') === total,
    'sale has an id and a receipt number': (res) => res.status === 200 && typeof res.json('id') === 'number' && typeof res.json('receiptNo') === 'string' && res.json('receiptNo') !== '',
    'sale belongs to this till shift': (res) => res.status === 200 && res.json('shiftId') === slot.shiftId,
    'change is what was tendered above the total': (res) => res.status === 200 && res.json('changeSatang') === tendered - total,
  })
  sleep(1)
}
