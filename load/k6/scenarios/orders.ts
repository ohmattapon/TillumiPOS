// Open orders from start to payment: open two orders, add and edit a line, move the order to a table, split the line
// off, merge it into the second order and pay both (one through a quote that pins the order, one straight).
//
// Cash only, for the reason given in checkout.ts. The seed has no tables and a cashier cannot create one, so the
// table move runs only when the shop has tables.
import { check, sleep } from 'k6'
import type { Response } from 'k6/http'
import { pickCart, pickExtraProduct } from '../lib/cart.ts'
import { api, type Session } from '../lib/client.ts'
import { config } from '../lib/config.ts'
import { idempotencyKeyFor } from '../lib/keys.ts'
import { vuRandom } from '../lib/random.ts'
import { loginForSlot, slotOfThisVu, type ShiftSlot } from '../lib/shifts.ts'

export const options = {
  thresholds: {
    'http_req_duration{name:orders.open}': ['p(95)<800'],
    'http_req_duration{name:orders.pay-quoted}': ['p(95)<800'],
    'http_req_duration{name:orders.pay}': ['p(95)<800'],
  },
}

interface OrderLine {
  lineId: number
  productId: number
  quantity: number
  note: string | null
}

interface Order {
  id: number
  status: string
  subtotalSatang: number
  tableId: number | null
  items: OrderLine[]
}

let session: Session | undefined
let random: (() => number) | undefined
let tableIds: number[] | undefined

const isOpenOrder = (order: Order | null): boolean => typeof order?.id === 'number' && order.status === 'open' && Array.isArray(order.items)

function checkSale(response: Response, total: number, shiftId: number, label: string) {
  check(response, {
    [`${label}: sale is completed with the expected total`]: (res) => res.status === 200 && res.json('status') === 'completed' && res.json('totalSatang') === total,
    [`${label}: sale has an id and a receipt number`]: (res) => res.status === 200 && typeof res.json('id') === 'number' && typeof res.json('receiptNo') === 'string' && res.json('receiptNo') !== '',
    [`${label}: sale is in this till shift`]: (res) => res.status === 200 && res.json('shiftId') === shiftId,
  })
}

/** One pass; a step that fails ends this pass only. The pause after it always runs, so a broken step is not retried in a tight loop. */
export function orders(slots: ShiftSlot[]) {
  try {
    runOrders(slots)
  } finally {
    sleep(1)
  }
}

function runOrders(slots: ShiftSlot[]) {
  const slot = slotOfThisVu(slots)
  session ??= loginForSlot(slot)
  random ??= vuRandom('orders', __VU)
  const { seed } = config()
  const client = api(session)
  if (tableIds === undefined) {
    const listed = client.get('/api/v1/catalog/tables/', { expect: [200], name: 'orders.tables' })
    tableIds = listed.status === 200 ? (listed.json('items') as { id: number; isActive: boolean }[]).filter((table) => table.isActive).map((table) => table.id) : []
  }

  const cart = pickCart(random, seed)
  const lines = cart.items.slice(0, 2)
  const extraProduct = pickExtraProduct(random, seed, cart)
  const label = `load-${__VU}-${__ITER}`

  const opened = client.post('/api/v1/orders/', { items: lines, label }, { expect: [200], name: 'orders.open' })
  const main = opened.status === 200 ? (opened.json() as Order) : null
  const secondOpened = client.post('/api/v1/orders/', { items: [{ productId: extraProduct, quantity: 1 }], label: `${label}-b` }, { expect: [200], name: 'orders.open' })
  const target = secondOpened.status === 200 ? (secondOpened.json() as Order) : null
  if (!check(main, { 'order opens with its lines': (order) => isOpenOrder(order) && order!.items.length === lines.length })) return
  if (!check(target, { 'second order opens': (order) => isOpenOrder(order) })) return

  if (tableIds.length > 0) {
    const tableId = tableIds[Math.floor(random() * tableIds.length)]!
    const moved = client.post(`/api/v1/orders/${main!.id}/move`, { tableId }, { expect: [200], name: 'orders.move' })
    check(moved, { 'order moves to the table': (res) => res.status === 200 && res.json('tableId') === tableId })
  }

  // A line is added, then its quantity and note are edited by line id.
  const added = client.post(`/api/v1/orders/${main!.id}/items`, { productId: extraProduct, quantity: 1 }, { expect: [200], name: 'orders.add-line' })
  const addedLine = added.status === 200 ? (added.json('items') as OrderLine[]).find((line) => line.productId === extraProduct) : undefined
  if (!check(addedLine, { 'added line is on the order': (line) => line !== undefined })) return
  const lineId = addedLine!.lineId
  const edited = client.patch(`/api/v1/orders/${main!.id}/lines/${lineId}`, { quantity: 2 }, { expect: [200], name: 'orders.edit-line' })
  check(edited, { 'line quantity is edited': (res) => res.status === 200 && (res.json('items') as OrderLine[]).some((line) => line.lineId === lineId && line.quantity === 2) })
  const noted = client.patch(`/api/v1/orders/${main!.id}/lines/${lineId}/note`, { note: 'no ice' }, { expect: [200], name: 'orders.note-line' })
  check(noted, { 'line note is saved': (res) => res.status === 200 && (res.json('items') as OrderLine[]).some((line) => line.lineId === lineId && line.note === 'no ice') })

  // The edited line is split off into its own order, which is then merged into the second order.
  const split = client.post(`/api/v1/orders/${main!.id}/split`, { lines: [{ lineId, quantity: 2 }] }, { expect: [200], name: 'orders.split' })
  const splitOff = split.status === 200 ? (split.json() as Order) : null
  if (!check(splitOff, { 'split makes a new order holding the line': (order) => isOpenOrder(order) && order!.id !== main!.id && order!.items.length === 1 && order!.items[0]!.quantity === 2 })) return
  const merged = client.post(`/api/v1/orders/${target!.id}/merge`, { sourceOrderId: splitOff!.id }, { expect: [200], name: 'orders.merge' })
  const mergedOrder = merged.status === 200 ? (merged.json() as Order) : null
  if (!check(mergedOrder, { 'merge puts the lines on the target': (order) => isOpenOrder(order) && order!.id === target!.id && order!.items.length === 2 })) return

  // The first order is priced by a quote that pins it; the merged one is paid at its own subtotal.
  const quoted = client.post('/api/v1/quotes/', { orderId: main!.id }, { expect: [200], name: 'orders.quote' })
  const quote = quoted.status === 200 ? quoted.json() : null
  if (check(quote, { 'order quote has an id and a total': (q) => typeof q?.id === 'number' && q.totalSatang > 0 })) {
    const paid = client.post(
      `/api/v2/orders/${main!.id}/pay`,
      { quoteId: quote.id, shiftId: slot.shiftId, payments: [{ method: 'cash', amountSatang: quote.totalSatang }] },
      { expect: [200], name: 'orders.pay-quoted', idempotencyKey: idempotencyKeyFor('orders', __VU, __ITER, 'pay-quoted') },
    )
    checkSale(paid, quote.totalSatang, slot.shiftId, 'quoted order')
  }
  const paid = client.post(
    `/api/v2/orders/${target!.id}/pay`,
    { shiftId: slot.shiftId, payments: [{ method: 'cash', amountSatang: mergedOrder!.subtotalSatang }] },
    { expect: [200], name: 'orders.pay', idempotencyKey: idempotencyKeyFor('orders', __VU, __ITER, 'pay') },
  )
  checkSale(paid, mergedOrder!.subtotalSatang, slot.shiftId, 'merged order')
}
