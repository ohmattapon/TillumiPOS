// What the owner does about stock: look at the low-stock list, receive goods (one product, then a batch with an
// Idempotency-Key), correct a count and read the movement history.
//
// Only ordinary products are touched. The hot ones are for the contention scenario, whose small stock a receipt
// here would change. Every change writes a stock movement, which the invariant checks compare with the stock level.
import { check, sleep } from 'k6'
import { loginOwner } from '../lib/auth.ts'
import { api, type Session } from '../lib/client.ts'
import { expectPage } from '../lib/checks.ts'
import { config } from '../lib/config.ts'
import { idempotencyKeyFor } from '../lib/keys.ts'
import { vuRandom } from '../lib/random.ts'

export const options = {
  thresholds: {
    'http_req_duration{name:stock.low-stock}': ['p(95)<300'],
    'http_req_duration{name:stock.product}': ['p(95)<300'],
    'http_req_duration{name:stock.movements}': ['p(95)<300'],
    'http_req_duration{name:stock.receipts}': ['p(95)<300'],
    'http_req_duration{name:stock.receive}': ['p(95)<800'],
    'http_req_duration{name:stock.receive-batch}': ['p(95)<800'],
    'http_req_duration{name:stock.receive-batch.replay}': ['p(95)<800'],
    'http_req_duration{name:stock.adjust}': ['p(95)<800'],
  },
}

/** The low-stock screen lists products with this many pieces or fewer, least first. */
const LOW_STOCK_AT_MOST = 20
const PAGE_SIZE = 50
const MAX_BATCH_LINES = 3

let session: Session | undefined
let random: (() => number) | undefined
let pool: number[] | undefined

interface ProductRow {
  id: number
  trackStock: boolean
}

/** The seeded ordinary products that keep a stock level, read once per virtual user. */
function stockedProducts(client: ReturnType<typeof api>): number[] {
  const ordinary = new Set(config().seed.productIds)
  const response = client.get('/api/v1/catalog/products/?limit=1000&offset=0', { expect: [200], name: 'stock.pool' })
  return expectPage<ProductRow>(response, 'stocked products', { minItems: 1 })
    .filter((row) => row.trackStock && ordinary.has(row.id))
    .map((row) => row.id)
}

function pickDistinct(rand: () => number, ids: number[], count: number): number[] {
  const chosen = new Set<number>()
  while (chosen.size < Math.min(count, ids.length)) chosen.add(ids[Math.floor(rand() * ids.length)]!)
  return [...chosen]
}

export function stock() {
  session ??= loginOwner()
  random ??= vuRandom('stock', __VU)
  const rand = random
  const client = api(session)
  pool ??= stockedProducts(client)
  if (pool.length === 0) {
    check(pool, { 'the seed has tracked ordinary products to receive': (ids) => ids.length > 0 })
    sleep(1)
    return
  }

  expectPage(client.get(`/api/v1/catalog/products/?stockAtMost=${LOW_STOCK_AT_MOST}&sort=stock&limit=${PAGE_SIZE}`, { expect: [200], name: 'stock.low-stock' }), 'low-stock list')

  // Receive one product.
  const [productId] = pickDistinct(rand, pool, 1) as [number]
  const quantity = 1 + Math.floor(rand() * 20)
  const received = client.post('/api/v1/inventory/receive', { productId, quantity, note: 'load test receipt' }, { expect: [200], name: 'stock.receive' })
  check(received, {
    'receive writes a receive movement of the quantity': (res) => res.status === 200 && res.json('type') === 'receive' && res.json('quantity') === quantity && res.json('productId') === productId,
    'receive leaves a balance of at least the quantity': (res) => res.status === 200 && (res.json('balanceAfter') as number) >= quantity,
  })

  // Receive a batch under an Idempotency-Key; sending the same key again must give the same receipt, not a second one.
  const lines = pickDistinct(rand, pool, 1 + Math.floor(rand() * MAX_BATCH_LINES)).map((id) => ({ productId: id, quantity: 1 + Math.floor(rand() * 20) }))
  const key = idempotencyKeyFor('stock', __VU, __ITER, 'receive-batch')
  const batch = client.post('/api/v1/inventory/receipts/', { items: lines, note: 'load test batch' }, { expect: [200], name: 'stock.receive-batch', idempotencyKey: key })
  const receiptId = batch.status === 200 ? (batch.json('id') as number) : null
  check(batch, {
    'batch receipt has every line': (res) => res.status === 200 && typeof res.json('id') === 'number' && (res.json('items') as unknown[]).length === lines.length,
  })
  const replayed = client.post('/api/v1/inventory/receipts/', { items: lines, note: 'load test batch' }, { expect: [200], name: 'stock.receive-batch.replay', idempotencyKey: key })
  check(replayed, { 'the same Idempotency-Key gives the same receipt': (res) => res.status === 200 && receiptId !== null && res.json('id') === receiptId })

  // Count the product again: one more than the system says.
  const [counted] = pickDistinct(rand, pool, 1) as [number]
  const product = client.get(`/api/v1/catalog/products/${counted}`, { expect: [200], name: 'stock.product' })
  const level = product.status === 200 ? (product.json('stockQty') as number) : null
  if (check(level, { 'product has a stock level': (value) => typeof value === 'number' })) {
    const adjusted = client.post('/api/v1/inventory/adjust', { productId: counted, countedQty: (level as number) + 1, note: 'load test count' }, { expect: [200], name: 'stock.adjust' })
    check(adjusted, { 'adjust writes an adjust movement': (res) => res.status === 200 && res.json('type') === 'adjust' && res.json('productId') === counted })
  }

  expectPage(client.get(`/api/v1/inventory/movements?productId=${productId}&limit=20`, { expect: [200], name: 'stock.movements' }), 'movements of a product', { minItems: 1 })
  expectPage(client.get('/api/v1/inventory/receipts/?limit=20', { expect: [200], name: 'stock.receipts' }), 'receipts list')
  sleep(1)
}
