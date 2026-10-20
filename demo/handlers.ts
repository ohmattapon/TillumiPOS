import { HttpResponse, http, type JsonBodyType, type RequestHandler } from 'msw'
import type { Order } from '@pos/api/types'
import type { PromotionResponse } from '../server/src/modules/promotions/adapters/controllers/schemas/promotion.schema'
import type { QrPaymentResponse } from '../server/src/modules/qr-payments/adapters/controllers/schemas/qr-payment.schema'
import type { QuoteResponse } from '../server/src/modules/quotes/adapters/controllers/schemas/quote.schema'
import type { shiftHttpSchemas } from '../server/src/modules/shifts/adapters/controllers/schemas/shift.schema'
import { demoDb } from './db'
import {
  branch,
  buildOrder,
  buildQuote,
  buildSale,
  loginUser,
  priceLine,
  summarizeSales,
  summarizeShift,
  switchUsers,
  type BillLineInput,
  type BillPaymentInput,
  type DemoShift,
} from './fixtures/index'

type DemoShiftSummary = typeof shiftHttpSchemas.summary.static
type DemoCashEntry = typeof shiftHttpSchemas.cashEntry.static
type DemoCurrentShift = typeof shiftHttpSchemas.currentShift.static

// The v2 QR shapes live in the v2 controller file, so they are mirrored here
// instead of imported; both sides were read from the same schema definitions.
interface DemoQrV2Payment {
  id: number
  branchId: number
  reference: string
  amountSatang: number
  status: 'pending' | 'paid' | 'cancelled'
  expiresAt: Date
  bankTransactionId: string | null
  payerName: string | null
  paidAt: Date | null
  saleId: number | null
  originShiftId: number | null
  dismissedAt: Date | null
  dismissReason: string | null
  createdAt: Date
}

// --- small response helpers -------------------------------------------------

const ok = (body: JsonBodyType): Response => HttpResponse.json(body)

const page = <T>(items: T[]): Response => HttpResponse.json({ items, total: items.length })

function problem(status: number, title: string, code: string, detail: string): Response {
  return HttpResponse.json({ type: 'about:blank', title, status, detail, code }, { status })
}

const notFound = (code: string, detail: string): Response => problem(404, 'Not Found', code, detail)

const signedOut = (): Response => problem(401, 'Unauthorized', 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ')

// --- request bodies (Eden always sends JSON where a body is read) ------------

interface SellBody {
  items?: BillLineInput[]
  discountSatang?: number
  payments?: BillPaymentInput[]
  memberId?: number | null
  quoteId?: number | null
}

interface OpenOrderBody {
  memberId?: number | null
  label?: string | null
  tableId?: number | null
  items?: BillLineInput[]
}

interface AddItemBody {
  productId: number
  quantity: number
  options?: number[]
}

interface TableBody {
  name?: string
  zone?: string | null
  seats?: number
  x?: number
  y?: number
  width?: number
  height?: number
  sortOrder?: number
  isActive?: boolean
}

interface MemberWriteBody {
  name?: string
  phone?: string
  isActive?: boolean
}

interface PromotionWriteBody {
  name?: string
  kind?: 'fixed' | 'percent'
  value?: number
  maxDiscountSatang?: number | null
  minSubtotalSatang?: number
  startsOn?: string | null
  endsOn?: string | null
  weekdays?: number[] | null
  windowStartMinute?: number | null
  windowEndMinute?: number | null
  audience?: 'everyone' | 'members'
  isActive?: boolean
}

interface QuoteBody {
  lines?: BillLineInput[]
  memberId?: number | null
  orderId?: number
}

async function readBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T
}

// --- shared builders ---------------------------------------------------------

function refreshOrder(order: Order): Order {
  return {
    ...order,
    updatedAt: new Date(),
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalSatang: order.items.reduce((sum, item) => sum + item.lineTotalSatang, 0),
  }
}

/** Records a one-step sale from the request items, with consistent totals. */
async function sell(request: Request, shiftId?: number): Promise<Response> {
  const body = await readBody<SellBody>(request)
  const quote: QuoteResponse | null = body.quoteId != null ? (demoDb.findQuote(body.quoteId) ?? null) : null
  const sale = buildSale(demoDb.catalog(), {
    id: demoDb.nextSaleId++,
    receiptNo: demoDb.receiptNo(),
    items: body.items ?? [],
    discountSatang: body.discountSatang ?? 0,
    payments: (body.payments ?? []).map((payment) => ({ method: payment.method, amountSatang: payment.amountSatang })),
    memberId: body.memberId,
    quote,
    createdAt: new Date(),
  })
  demoDb.appendSale(sale)
  return ok(shiftId === undefined ? sale : { ...sale, shiftId })
}

function voidSale(id: number, reason: string, shiftId?: number): Response {
  const sale = demoDb.markSaleVoided(id, reason)
  if (!sale) return notFound('SALE_NOT_FOUND', 'ไม่พบบิลนี้')
  return ok(shiftId === undefined ? sale : { ...sale, shiftId: shiftId ?? 1 })
}

/** Pays an open order at its snapshot prices and closes it with the new bill. */
async function payOrder(id: number, request: Request, shiftId?: number): Promise<Response> {
  const order = demoDb.findOrder(id)
  if (!order || order.status !== 'open') return notFound('ORDER_NOT_FOUND', 'ไม่พบออเดอร์ที่ยังเปิดอยู่')
  const body = await readBody<SellBody>(request)
  const quote: QuoteResponse | null = body.quoteId != null ? (demoDb.findQuote(body.quoteId) ?? null) : null
  const sale = buildSale(demoDb.catalog(), {
    id: demoDb.nextSaleId++,
    receiptNo: demoDb.receiptNo(),
    items: order.items.map((item) => ({ productId: item.productId, quantity: item.quantity, options: item.options.map((option) => option.optionId) })),
    discountSatang: body.discountSatang ?? 0,
    payments: (body.payments ?? []).map((payment) => ({ method: payment.method, amountSatang: payment.amountSatang })),
    memberId: order.memberId,
    quote,
    createdAt: new Date(),
  })
  demoDb.appendSale(sale)
  demoDb.upsertOrder({ ...order, status: 'paid', saleId: sale.id, updatedAt: new Date() })
  return ok(shiftId === undefined ? sale : { ...sale, shiftId })
}

function orderLinesOf(order: Order): BillLineInput[] {
  return order.items.map((item) => ({ productId: item.productId, quantity: item.quantity, options: item.options.map((option) => option.optionId) }))
}

/** The v2 QR answer for an id that was never created: paid, so polling ends. */
function cannedQrV2(id: number): DemoQrV2Payment {
  const now = new Date()
  return {
    id,
    branchId: 1,
    reference: `DEMO-${id}`,
    amountSatang: 10000,
    status: 'paid',
    expiresAt: new Date(now.getTime() + 5 * 60_000),
    bankTransactionId: null,
    payerName: 'ผู้สแกนตัวอย่าง',
    paidAt: now,
    saleId: null,
    originShiftId: 1,
    dismissedAt: null,
    dismissReason: null,
    createdAt: now,
  }
}

function cannedQrV1(id: number): QrPaymentResponse {
  const v2 = cannedQrV2(id)
  const { originShiftId: _shift, dismissedAt: _dismissedAt, dismissReason: _reason, ...v1 } = v2
  return v1
}

function currentShiftView(shift: DemoShift): NonNullable<DemoCurrentShift> {
  return {
    id: shift.id,
    registerId: shift.registerId,
    status: shift.status as 'open' | 'closing',
    openedAt: shift.openedAt,
    openedByName: shift.openedByName,
    openingCashSatang: shift.openingCashSatang,
    closingRevision: shift.closingRevision,
  }
}

function shiftSummaryFor(shift: DemoShift): DemoShiftSummary {
  return summarizeShift(demoDb.sales, demoDb.cashEntries.filter((entry) => entry.shiftId === shift.id), shift)
}

// --- handlers, one per feature -----------------------------------------------

const auth = [
  http.post('/api/v1/auth/login', () => {
    demoDb.session.signedIn = true
    return ok(loginUser)
  }),
  http.post('/api/v1/auth/logout', () => {
    demoDb.session.signedIn = false
    return ok({ ok: true })
  }),
  http.get('/api/v1/auth/me', () => (demoDb.session.signedIn ? ok(demoDb.me) : signedOut())),
  http.get('/api/v1/auth/switch-users', () => ok(switchUsers)),
]

const boot = [
  http.get('/api/v1/setup', () => ok({ needsSetup: false })),
  http.get('/api/v1/settings', () => ok(demoDb.settings)),
  http.get('/api/v1/branches', () => page([branch])),
  http.get('/api/v2/capabilities', () => ok({ checkoutMode: 'shifts', imageStorage: 'disabled' })),
]

const catalog = [
  http.get('/api/v1/catalog/categories', () => page(demoDb.categories)),
  http.get('/api/v1/catalog/products', ({ request }) => {
    const query = new URL(request.url).searchParams
    const code = query.get('code')
    const keyword = query.get('q')?.toLowerCase()
    const categoryId = query.get('categoryId')
    const includeInactive = query.get('includeInactive') === 'true'
    const isActive = query.get('isActive')
    const stockAtMost = query.get('stockAtMost')
    let items = demoDb.products.filter((item) => {
      if (includeInactive) return true
      if (isActive !== null) return item.isActive === (isActive === 'true')
      return item.isActive
    })
    if (code) items = items.filter((item) => item.sku === code || item.barcode === code)
    if (keyword) items = items.filter((item) => item.name.toLowerCase().includes(keyword) || item.sku.toLowerCase().includes(keyword))
    if (categoryId !== null) items = items.filter((item) => item.categoryId === Number(categoryId))
    if (stockAtMost !== null) items = items.filter((item) => item.stockQty <= Number(stockAtMost))
    if (query.get('sort') === 'stock') items = [...items].sort((a, b) => a.stockQty - b.stockQty)
    const total = items.length
    const limit = query.get('limit')
    const offset = Number(query.get('offset') ?? 0)
    if (limit !== null) items = items.slice(offset, offset + Number(limit))
    return ok({ items, total })
  }),
  http.get('/api/v1/catalog/products/:id', ({ params }) => {
    const found = demoDb.findProduct(Number(params.id))
    return found ? ok(found) : notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้')
  }),
  http.get('/api/v1/catalog/modifier-groups', () => page(demoDb.modifierGroups)),
  http.get('/api/v1/catalog/tables', () => {
    const open = demoDb.orders.filter((order) => order.status === 'open')
    return page(
      demoDb.tables.map((table) => {
        const mine = open.filter((order) => order.tableId === table.id)
        return { ...table, openOrders: mine.length, openTotalSatang: mine.reduce((sum, order) => sum + order.subtotalSatang, 0) }
      }),
    )
  }),
  http.post('/api/v1/catalog/tables', async ({ request }) => {
    const body = await readBody<TableBody>(request)
    const id = demoDb.nextTableId++
    const created = {
      id,
      branchId: 1,
      name: body.name ?? `โต๊ะ ${id}`,
      zone: body.zone ?? null,
      seats: body.seats ?? 2,
      x: body.x ?? 0,
      y: body.y ?? 0,
      width: body.width ?? 120,
      height: body.height ?? 100,
      sortOrder: body.sortOrder ?? id,
      isActive: true,
      openOrders: 0,
      openTotalSatang: 0,
    }
    demoDb.tables.push(created)
    return ok(created)
  }),
  http.patch('/api/v1/catalog/tables/:id', async ({ params, request }) => {
    const table = demoDb.findTable(Number(params.id))
    if (!table) return notFound('TABLE_NOT_FOUND', 'ไม่พบโต๊ะนี้')
    Object.assign(table, await readBody<TableBody>(request))
    return ok(table)
  }),
]

const members = [
  http.get('/api/v1/members', ({ request }) => {
    const query = new URL(request.url).searchParams
    const search = query.get('search')?.toLowerCase()
    const isActive = query.get('isActive')
    let items = demoDb.members
    if (search) items = items.filter((item) => item.name.toLowerCase().includes(search) || item.phone.includes(search) || item.code.toLowerCase().includes(search))
    if (isActive !== null) items = items.filter((item) => item.isActive === (isActive === 'true'))
    const total = items.length
    const limit = query.get('limit')
    if (limit !== null) items = items.slice(Number(query.get('offset') ?? 0), Number(query.get('offset') ?? 0) + Number(limit))
    return ok({ items, total })
  }),
  http.post('/api/v1/members', async ({ request }) => {
    const body = await readBody<{ name: string; phone: string }>(request)
    const id = demoDb.nextMemberId++
    const now = new Date()
    const created = { id, code: `M-${String(id).padStart(4, '0')}`, name: body.name, phone: body.phone, isActive: true, createdAt: now, updatedAt: now }
    demoDb.members.unshift(created)
    return ok(created)
  }),
  http.get('/api/v1/members/:id', ({ params }) => {
    const found = demoDb.findMember(Number(params.id))
    return found ? ok(found) : notFound('MEMBER_NOT_FOUND', 'ไม่พบสมาชิกนี้')
  }),
  http.patch('/api/v1/members/:id', async ({ params, request }) => {
    const member = demoDb.findMember(Number(params.id))
    if (!member) return notFound('MEMBER_NOT_FOUND', 'ไม่พบสมาชิกนี้')
    Object.assign(member, { ...(await readBody<MemberWriteBody>(request)), updatedAt: new Date() })
    return ok(member)
  }),
  http.get('/api/v1/members/:id/sales', ({ params }) => {
    const member = demoDb.findMember(Number(params.id))
    if (!member) return notFound('MEMBER_NOT_FOUND', 'ไม่พบสมาชิกนี้')
    const bills = demoDb.sales.filter((sale) => sale.member?.id === member.id && sale.status === 'completed')
    return ok({
      items: bills.map((sale) => ({ id: sale.id, receiptNo: sale.receiptNo, branchId: sale.branchId, cashierName: sale.cashierName, status: sale.status, totalSatang: sale.totalSatang, createdAt: sale.createdAt })),
      total: bills.length,
      summary: { saleCount: bills.length, totalSatang: bills.reduce((sum, sale) => sum + sale.totalSatang, 0) },
    })
  }),
]

const promotions = [
  http.get('/api/v1/promotions', ({ request }) => {
    const isActive = new URL(request.url).searchParams.get('isActive')
    const items = isActive === null ? demoDb.promotions : demoDb.promotions.filter((item) => item.isActive === (isActive === 'true'))
    return page(items)
  }),
  http.post('/api/v1/promotions', async ({ request }) => {
    const body = await readBody<PromotionWriteBody>(request)
    const now = new Date()
    const created: PromotionResponse = {
      id: demoDb.nextPromotionId++,
      name: body.name ?? 'โปรโมชัน',
      kind: body.kind ?? 'percent',
      value: body.value ?? 1000,
      maxDiscountSatang: body.maxDiscountSatang ?? null,
      minSubtotalSatang: body.minSubtotalSatang ?? 0,
      startsOn: body.startsOn ?? null,
      endsOn: body.endsOn ?? null,
      weekdays: body.weekdays ?? null,
      windowStartMinute: body.windowStartMinute ?? null,
      windowEndMinute: body.windowEndMinute ?? null,
      audience: body.audience ?? 'everyone',
      isActive: body.isActive ?? true,
      scope: null,
      imageUrl: null,
      createdAt: now,
      updatedAt: now,
    }
    demoDb.promotions.unshift(created)
    return ok(created)
  }),
  http.get('/api/v1/promotions/:id', ({ params }) => {
    const found = demoDb.findPromotion(Number(params.id))
    return found ? ok(found) : notFound('PROMOTION_NOT_FOUND', 'ไม่พบโปรโมชันนี้')
  }),
  http.patch('/api/v1/promotions/:id', async ({ params, request }) => {
    const promotion = demoDb.findPromotion(Number(params.id))
    if (!promotion) return notFound('PROMOTION_NOT_FOUND', 'ไม่พบโปรโมชันนี้')
    Object.assign(promotion, { ...(await readBody<PromotionWriteBody>(request)), updatedAt: new Date() })
    return ok(promotion)
  }),
  http.post('/api/v1/quotes', async ({ request }) => {
    const body = await readBody<QuoteBody>(request)
    let lines = body.lines ?? []
    let memberId = body.memberId
    if (body.orderId != null) {
      const order = demoDb.findOrder(body.orderId)
      if (!order) return notFound('ORDER_NOT_FOUND', 'ไม่พบออเดอร์ที่ยังเปิดอยู่')
      lines = orderLinesOf(order)
      memberId = order.memberId
    }
    const quote = buildQuote(demoDb.catalog(), { id: demoDb.nextQuoteId++, lines, memberId, orderId: body.orderId, createdAt: new Date() })
    demoDb.appendQuote(quote)
    return ok(quote)
  }),
  http.get('/api/v1/quotes/:id', ({ params }) => {
    const found = demoDb.findQuote(Number(params.id))
    return found ? ok(found) : notFound('QUOTE_NOT_FOUND', 'ไม่พบราคาที่ล็อกไว้นี้')
  }),
]

const sales = [
  http.get('/api/v1/sales/summary', () => ok(summarizeSales(demoDb.sales))),
  http.get('/api/v1/sales', ({ request }) => {
    const status = new URL(request.url).searchParams.get('status')
    const items = demoDb.sales
      .filter((sale) => status === null || sale.status === status)
      .map((sale) => {
        const { items: _items, payments: _payments, ...header } = sale
        return header
      })
    return ok({ items, total: items.length })
  }),
  http.get('/api/v1/sales/:id', ({ params }) => {
    const found = demoDb.findSale(Number(params.id))
    return found ? ok(found) : notFound('SALE_NOT_FOUND', 'ไม่พบบิลนี้')
  }),
  http.post('/api/v1/sales', ({ request }) => sell(request)),
  http.post('/api/v1/sales/:id/void', async ({ params, request }) => {
    const body = await readBody<{ reason: string }>(request)
    return voidSale(Number(params.id), body.reason)
  }),
]

const orders = [
  http.get('/api/v1/orders', ({ request }) => {
    const query = new URL(request.url).searchParams
    const status = query.get('status')
    const tableId = query.get('tableId')
    const excludeId = query.get('excludeId')
    const items = demoDb.orders.filter((order) => {
      if (status !== null && order.status !== status) return false
      if (tableId !== null && order.tableId !== Number(tableId)) return false
      if (excludeId !== null && order.id === Number(excludeId)) return false
      return true
    })
    return ok({ items, total: items.length })
  }),
  http.post('/api/v1/orders', async ({ request }) => {
    const body = await readBody<OpenOrderBody>(request)
    const built = buildOrder(demoDb.catalog(), {
      id: demoDb.nextOrderId++,
      label: body.label ?? null,
      tableId: body.tableId ?? null,
      memberId: body.memberId,
      lines: body.items ?? [],
      createdAt: new Date(),
    }, demoDb.nextLineId)
    demoDb.nextLineId = built.nextLineId
    demoDb.upsertOrder(built.order)
    return ok(built.order)
  }),
  http.get('/api/v1/orders/:id', ({ params }) => {
    const found = demoDb.findOrder(Number(params.id))
    return found ? ok(found) : notFound('ORDER_NOT_FOUND', 'ไม่พบออเดอร์นี้')
  }),
  http.post('/api/v1/orders/:id/items', async ({ params, request }) => {
    const order = demoDb.findOrder(Number(params.id))
    if (!order || order.status !== 'open') return notFound('ORDER_NOT_FOUND', 'ไม่พบออเดอร์ที่ยังเปิดอยู่')
    const body = await readBody<AddItemBody>(request)
    const wanted = [...(body.options ?? [])].sort((a, b) => a - b)
    const same = order.items.find((item) => {
      const mine = item.options.map((option) => option.optionId).sort((a, b) => a - b)
      return item.productId === body.productId && mine.length === wanted.length && mine.every((id, index) => id === wanted[index])
    })
    if (same) {
      same.quantity += body.quantity
      same.lineTotalSatang = same.unitPriceSatang * same.quantity
    } else {
      const priced = priceLine(demoDb.catalog(), { productId: body.productId, quantity: body.quantity, options: body.options })
      order.items.push({
        lineId: demoDb.nextLineId++,
        productId: priced.product.id,
        productName: priced.product.name,
        sku: priced.product.sku,
        unitPriceSatang: priced.unitPriceSatang,
        quantity: body.quantity,
        lineTotalSatang: priced.lineTotalSatang,
        options: priced.options,
        note: null,
      })
    }
    const updated = refreshOrder(order)
    demoDb.upsertOrder(updated)
    return ok(updated)
  }),
  http.patch('/api/v1/orders/:id/lines/:lineId', async ({ params, request }) => {
    const order = demoDb.findOrder(Number(params.id))
    const line = order?.status === 'open' ? order.items.find((item) => item.lineId === Number(params.lineId)) : undefined
    if (!order || !line) return notFound('ORDER_LINE_NOT_FOUND', 'ไม่พบบรรทัดนี้ในออเดอร์')
    const body = await readBody<{ quantity: number }>(request)
    line.quantity = body.quantity
    line.lineTotalSatang = line.unitPriceSatang * body.quantity
    const updated = refreshOrder(order)
    demoDb.upsertOrder(updated)
    return ok(updated)
  }),
  http.patch('/api/v1/orders/:id/lines/:lineId/note', async ({ params, request }) => {
    const order = demoDb.findOrder(Number(params.id))
    const line = order?.status === 'open' ? order.items.find((item) => item.lineId === Number(params.lineId)) : undefined
    if (!order || !line) return notFound('ORDER_LINE_NOT_FOUND', 'ไม่พบบรรทัดนี้ในออเดอร์')
    line.note = (await readBody<{ note: string | null }>(request)).note
    const updated = refreshOrder(order)
    demoDb.upsertOrder(updated)
    return ok(updated)
  }),
  http.delete('/api/v1/orders/:id/lines/:lineId', ({ params }) => {
    const order = demoDb.findOrder(Number(params.id))
    if (!order || order.status !== 'open') return notFound('ORDER_NOT_FOUND', 'ไม่พบออเดอร์ที่ยังเปิดอยู่')
    order.items = order.items.filter((item) => item.lineId !== Number(params.lineId))
    const updated = refreshOrder(order)
    demoDb.upsertOrder(updated)
    return ok(updated)
  }),
  http.patch('/api/v1/orders/:id/member', async ({ params, request }) => {
    const order = demoDb.findOrder(Number(params.id))
    if (!order || order.status !== 'open') return notFound('ORDER_NOT_FOUND', 'ไม่พบออเดอร์ที่ยังเปิดอยู่')
    order.memberId = (await readBody<{ memberId: number | null }>(request)).memberId
    const updated = refreshOrder(order)
    demoDb.upsertOrder(updated)
    return ok(updated)
  }),
  http.post('/api/v1/orders/:id/move', async ({ params, request }) => {
    const order = demoDb.findOrder(Number(params.id))
    if (!order || order.status !== 'open') return notFound('ORDER_NOT_FOUND', 'ไม่พบออเดอร์ที่ยังเปิดอยู่')
    order.tableId = (await readBody<{ tableId: number | null }>(request)).tableId
    const updated = refreshOrder(order)
    demoDb.upsertOrder(updated)
    return ok(updated)
  }),
  http.post('/api/v1/orders/:id/merge', async ({ params, request }) => {
    const target = demoDb.findOrder(Number(params.id))
    const source = demoDb.findOrder((await readBody<{ sourceOrderId: number }>(request)).sourceOrderId)
    if (!target || target.status !== 'open' || !source || source.status !== 'open') return notFound('ORDER_NOT_FOUND', 'ไม่พบออเดอร์ที่ยังเปิดอยู่')
    target.items.push(...source.items)
    demoDb.upsertOrder({ ...source, status: 'merged', mergedIntoId: target.id, items: [], itemCount: 0, subtotalSatang: 0, updatedAt: new Date() })
    const updated = refreshOrder(target)
    demoDb.upsertOrder(updated)
    return ok(updated)
  }),
  http.post('/api/v1/orders/:id/split', async ({ params, request }) => {
    const source = demoDb.findOrder(Number(params.id))
    if (!source || source.status !== 'open') return notFound('ORDER_NOT_FOUND', 'ไม่พบออเดอร์ที่ยังเปิดอยู่')
    const body = await readBody<{ lines: { lineId: number; quantity: number }[]; label?: string | null }>(request)
    const wanted = new Map(body.lines.map((line) => [line.lineId, line.quantity]))
    const moved: Order['items'] = []
    source.items = source.items.flatMap((item) => {
      const take = wanted.get(item.lineId) ?? 0
      if (take <= 0 || take >= item.quantity) return [item]
      const rest = { ...item, quantity: item.quantity - take, lineTotalSatang: item.unitPriceSatang * (item.quantity - take) }
      moved.push({ ...item, lineId: demoDb.nextLineId++, quantity: take, lineTotalSatang: item.unitPriceSatang * take })
      return [rest]
    })
    const built = buildOrder(demoDb.catalog(), {
      id: demoDb.nextOrderId++,
      label: body.label ?? null,
      tableId: source.tableId,
      memberId: source.memberId,
      lines: moved.map((item) => ({ productId: item.productId, quantity: item.quantity, options: item.options.map((option) => option.optionId), note: item.note })),
      createdAt: new Date(),
    }, demoDb.nextLineId)
    demoDb.nextLineId = built.nextLineId
    demoDb.upsertOrder(refreshOrder(source))
    demoDb.upsertOrder(built.order)
    return ok(built.order)
  }),
  http.post('/api/v1/orders/:id/cancel', async ({ params, request }) => {
    const order = demoDb.findOrder(Number(params.id))
    if (!order || order.status !== 'open') return notFound('ORDER_NOT_FOUND', 'ไม่พบออเดอร์ที่ยังเปิดอยู่')
    const updated: Order = { ...order, status: 'cancelled', cancelReason: (await readBody<{ reason: string }>(request)).reason, updatedAt: new Date() }
    demoDb.upsertOrder(updated)
    return ok(updated)
  }),
  http.post('/api/v1/orders/:id/pay', ({ params, request }) => payOrder(Number(params.id), request)),
]

const qrLegacy = [
  http.get('/api/v1/payments/qr/config', () => ok({ enabled: false })),
  http.post('/api/v1/payments/qr', async ({ request }) => {
    const body = await readBody<{ amountSatang: number }>(request)
    const payment = cannedQrV1(9000 + body.amountSatang)
    return ok({ ...payment, amountSatang: body.amountSatang, qrRawData: 'demo-qr-payload', qrImage: '' })
  }),
  http.get('/api/v1/payments/qr/:id', ({ params }) => ok(cannedQrV1(Number(params.id)))),
  http.post('/api/v1/payments/qr/:id/cancel', ({ params }) => ok({ ...cannedQrV1(Number(params.id)), status: 'cancelled' as const })),
]

const shifts = [
  http.get('/api/v2/registers', () => page(demoDb.registers)),
  http.post('/api/v2/registers', async ({ request }) => {
    const body = await readBody<{ code: string; name: string }>(request)
    const created = { id: demoDb.nextRegisterId++, branchId: 1, code: body.code, name: body.name, isActive: true }
    demoDb.registers.push(created)
    return ok(created)
  }),
  http.patch('/api/v2/registers/:id', async ({ params, request }) => {
    const register = demoDb.findRegister(Number(params.id))
    if (!register) return notFound('REGISTER_NOT_FOUND', 'ไม่พบจุดขายนี้')
    Object.assign(register, await readBody<{ name?: string; isActive?: boolean }>(request))
    return ok(register)
  }),
  http.get('/api/v2/registers/:id/current-shift', ({ params }) => {
    const current = demoDb.currentShiftFor(Number(params.id))
    return ok(current ? currentShiftView(current) : null)
  }),
  http.get('/api/v2/shifts', ({ request }) => {
    const query = new URL(request.url).searchParams
    const registerId = query.get('registerId')
    const status = query.get('status')
    const items = demoDb.shifts.filter((shift) => {
      if (registerId !== null && shift.registerId !== Number(registerId)) return false
      if (status !== null && shift.status !== status) return false
      return true
    })
    return ok({ items, total: items.length })
  }),
  http.post('/api/v2/shifts', async ({ request }) => {
    const body = await readBody<{ registerId: number; openingCashSatang: number; openingNote?: string | null }>(request)
    if (!demoDb.findRegister(body.registerId)) return notFound('REGISTER_NOT_FOUND', 'ไม่พบจุดขายนี้')
    const now = new Date()
    const created: DemoShift = {
      id: demoDb.nextShiftId++,
      branchId: 1,
      registerId: body.registerId,
      status: 'open',
      openedAt: now,
      openedById: 1,
      openedByName: 'เจ้าของร้าน',
      openingCashSatang: body.openingCashSatang,
      openingNote: body.openingNote ?? null,
      currency: 'THB',
      timeZone: 'Asia/Bangkok',
      closingRevision: 1,
      closingStartedAt: null,
      closingStartedById: null,
      closingStartedByName: null,
      closingExpectedCashSatang: null,
      closedAt: null,
      closedById: null,
      closedByName: null,
      countedCashSatang: null,
      cashDifferenceSatang: null,
      differenceReason: null,
    }
    demoDb.shifts.unshift(created)
    return ok(created)
  }),
  http.get('/api/v2/shifts/:id', ({ params }) => {
    const found = demoDb.findShift(Number(params.id))
    return found ? ok(found) : notFound('SHIFT_NOT_FOUND', 'ไม่พบกะนี้')
  }),
  http.get('/api/v2/shifts/:id/summary', ({ params }) => {
    const found = demoDb.findShift(Number(params.id))
    return found ? ok(shiftSummaryFor(found)) : notFound('SHIFT_NOT_FOUND', 'ไม่พบกะนี้')
  }),
  http.get('/api/v2/shifts/:id/cash-entries', ({ params }) => {
    const items = demoDb.cashEntries.filter((entry) => entry.shiftId === Number(params.id))
    return ok({ items, total: items.length })
  }),
  http.post('/api/v2/shifts/:id/cash-entries', async ({ params, request }) => {
    const shiftId = Number(params.id)
    if (!demoDb.findShift(shiftId)) return notFound('SHIFT_NOT_FOUND', 'ไม่พบกะนี้')
    const body = await readBody<{ kind: 'cash_in' | 'cash_out'; amountSatang: number; reason: string }>(request)
    const created: DemoCashEntry = {
      id: demoDb.nextEntryId++,
      shiftId,
      kind: body.kind,
      amountSatang: body.amountSatang,
      saleId: null,
      actorId: 1,
      actorName: 'เจ้าของร้าน',
      reason: body.reason,
      createdAt: new Date(),
    }
    demoDb.cashEntries.unshift(created)
    return ok(created)
  }),
  http.post('/api/v2/shifts/:id/start-closing', ({ params }) => {
    const shift = demoDb.findShift(Number(params.id))
    if (!shift || shift.status !== 'open') return notFound('SHIFT_NOT_FOUND', 'ไม่พบกะที่ยังเปิดอยู่')
    shift.status = 'closing'
    shift.closingRevision += 1
    shift.closingStartedAt = new Date()
    shift.closingStartedById = 1
    shift.closingStartedByName = 'เจ้าของร้าน'
    shift.closingExpectedCashSatang = shiftSummaryFor(shift).summary.expectedCashSatang
    return ok(shift)
  }),
  http.post('/api/v2/shifts/:id/cancel-closing', ({ params }) => {
    const shift = demoDb.findShift(Number(params.id))
    if (!shift || shift.status !== 'closing') return notFound('SHIFT_NOT_FOUND', 'ไม่พบกะที่กำลังนับเงิน')
    shift.status = 'open'
    shift.closingStartedAt = null
    shift.closingStartedById = null
    shift.closingStartedByName = null
    return ok(shift)
  }),
  http.post('/api/v2/shifts/:id/close', async ({ params, request }) => {
    const shift = demoDb.findShift(Number(params.id))
    if (!shift || shift.status !== 'closing') return notFound('SHIFT_NOT_FOUND', 'ไม่พบกะที่กำลังนับเงิน')
    const body = await readBody<{ closingRevision: number; countedCashSatang: number; reason?: string }>(request)
    const expected = shift.closingExpectedCashSatang ?? 0
    shift.status = 'closed'
    shift.closedAt = new Date()
    shift.closedById = 1
    shift.closedByName = 'เจ้าของร้าน'
    shift.countedCashSatang = body.countedCashSatang
    shift.cashDifferenceSatang = body.countedCashSatang - expected
    shift.differenceReason = body.reason ?? null
    return ok(shift)
  }),
  http.post('/api/v2/sales', ({ request }) => sell(request, 1)),
  http.post('/api/v2/sales/:id/void', async ({ params, request }) => {
    const body = await readBody<{ reason: string }>(request)
    return voidSale(Number(params.id), body.reason, 1)
  }),
  http.post('/api/v2/sales/:id/cash-refund', async ({ params, request }) => {
    const sale = demoDb.findSale(Number(params.id))
    if (!sale) return notFound('SALE_NOT_FOUND', 'ไม่พบบิลนี้')
    const body = await readBody<{ shiftId: number; reason: string }>(request)
    // Answered, not recorded: a refund entry would move the frozen report, which stays still in the demo.
    const refund: DemoCashEntry = {
      id: demoDb.nextEntryId,
      shiftId: body.shiftId,
      kind: 'cash_refund',
      amountSatang: sale.payments.filter((payment) => payment.method === 'cash').reduce((sum, payment) => sum + payment.amountSatang, 0) - sale.changeSatang,
      saleId: sale.id,
      actorId: 1,
      actorName: 'เจ้าของร้าน',
      reason: body.reason,
      createdAt: new Date(),
    }
    return ok(refund)
  }),
  http.post('/api/v2/orders/:id/pay', ({ params, request }) => payOrder(Number(params.id), request, 1)),
  http.get('/api/v2/payments/qr/unclaimed', () => ok({ items: [], total: 0 })),
  http.get('/api/v2/payments/qr/hold', () => ok(null)),
  http.get('/api/v2/payments/qr/attempts', () => ok({ items: [], total: 0 })),
  http.post('/api/v2/payments/qr/attempts/:id/resolve', ({ params }) => {
    const now = new Date()
    return ok({ id: Number(params.id), originShiftId: 1, reference: `DEMO-${params.id}`, amountSatang: 10000, state: 'ready' as const, qrPaymentId: null, actorName: 'เจ้าของร้าน', createdAt: now })
  }),
  http.post('/api/v2/payments/qr', async ({ request }) => {
    const body = await readBody<{ amountSatang: number; shiftId: number }>(request)
    const now = new Date()
    const created: DemoQrV2Payment = {
      ...cannedQrV2(9100 + demoDb.nextSaleId),
      amountSatang: body.amountSatang,
      status: 'pending',
      payerName: null,
      paidAt: null,
      originShiftId: body.shiftId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 5 * 60_000),
    }
    return ok({ ...created, qrRawData: 'demo-qr-payload', qrImage: '' })
  }),
  http.get('/api/v2/payments/qr/:id', ({ params }) => ok(cannedQrV2(Number(params.id)))),
  http.post('/api/v2/payments/qr/:id/refresh', ({ params }) => ok(cannedQrV2(Number(params.id)))),
  http.post('/api/v2/payments/qr/:id/cancel', ({ params }) => ok({ ...cannedQrV2(Number(params.id)), status: 'cancelled' as const })),
  http.post('/api/v2/payments/qr/:id/dismiss', async ({ params, request }) => {
    const body = await readBody<{ reason: string }>(request)
    return ok({ ...cannedQrV2(Number(params.id)), status: 'cancelled' as const, dismissedAt: new Date(), dismissReason: body.reason })
  }),
]

export const handlers: RequestHandler[] = [...auth, ...boot, ...catalog, ...members, ...promotions, ...sales, ...orders, ...qrLegacy, ...shifts]
