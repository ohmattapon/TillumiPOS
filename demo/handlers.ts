import { HttpResponse, http, type JsonBodyType, type RequestHandler } from 'msw'
import type { Order, ShopSettings } from '@pos/api/types'
import type { PromotionResponse } from '../server/src/modules/promotions/adapters/controllers/schemas/promotion.schema'
import type { QrPaymentResponse } from '../server/src/modules/qr-payments/adapters/controllers/schemas/qr-payment.schema'
import type { QuoteResponse } from '../server/src/modules/quotes/adapters/controllers/schemas/quote.schema'
import type { shiftHttpSchemas } from '../server/src/modules/shifts/adapters/controllers/schemas/shift.schema'
import type { UserResponse } from '../server/src/modules/users/adapters/controllers/schemas/user.schema'
import { demoDb } from './db'
import {
  appliedCafeMenu,
  branch,
  buildMovement,
  buildOrder,
  buildQuote,
  buildReceipt,
  buildReportBranches,
  buildReportOverview,
  buildReportProducts,
  buildSale,
  priceLine,
  productImages,
  slideImages,
  summarizeSales,
  summarizeShift,
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

interface SwitchBody {
  userId: number
  pin: string
}

interface OwnPinBody {
  currentPassword: string
  pin: string | null
}

interface SetupBody {
  setupCode: string
  shopName: string
  branchName?: string
  username: string
  displayName: string
  password: string
  shopType?: string
}

interface BranchBody {
  code?: string
  name?: string
  address?: string | null
  phone?: string | null
  isActive?: boolean
}

interface CategoryBody {
  name?: string
  sortOrder?: number
  isActive?: boolean
}

interface ModifierGroupBody {
  name?: string
  required?: boolean
  maxSelections?: number
  sortOrder?: number
  isActive?: boolean
}

interface ModifierOptionBody {
  name?: string
  priceSatang?: number
  costSatang?: number
  sortOrder?: number
  isActive?: boolean
  isDefault?: boolean
}

interface ProductBody {
  productType?: 'normal' | 'cafe'
  sku?: string
  name?: string
  barcode?: string | null
  categoryId?: number | null
  priceSatang?: number
  costSatang?: number
  trackStock?: boolean
  isActive?: boolean
}

interface ReceiveBody {
  productId: number
  quantity: number
  note?: string
}

interface AdjustBody {
  productId: number
  countedQty: number
  note?: string
}

interface BatchReceiptBody {
  items: { productId: number; quantity: number }[]
  note?: string
}

interface RoleBody {
  name?: string
  permissions?: string[]
}

interface UserCreateBody {
  username: string
  password: string
  displayName: string
  role?: 'owner' | 'cashier'
  roleId?: number
  branchId?: number
}

interface UserChangesBody {
  displayName?: string
  role?: 'owner' | 'cashier'
  roleId?: number
  branchId?: number
  isActive?: boolean
  password?: string
}

interface PinBody {
  pin: string | null
}

interface SlideBody {
  sortOrder?: number
  isActive?: boolean
}

interface PairBody {
  code: string
  registerId?: number | null
}

interface CafeMenuBody {
  itemKeys: string[]
}

async function readBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T
}

/** An Eden file upload arrives as multipart; the showcase keeps a local picture, never the bytes. */
async function readUploadedFile(request: Request): Promise<File | null> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) return null
  const form = await request.formData()
  const file = form.get('file')
  return file instanceof File ? file : null
}

/** The next local showcase picture, round-robin, so uploads always show something. */
function nextDemoImage(pool: string[]): string {
  return pool[demoDb.nextImageIdx++ % pool.length]!
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
  demoDb.audit({ action: 'sale.complete', entityType: 'sale', entityId: String(sale.id), summary: `ขายบิล ${sale.receiptNo}` })
  return ok(shiftId === undefined ? sale : { ...sale, shiftId })
}

function voidSale(id: number, reason: string, shiftId?: number): Response {
  const sale = demoDb.markSaleVoided(id, reason)
  if (!sale) return notFound('SALE_NOT_FOUND', 'ไม่พบบิลนี้')
  demoDb.audit({ action: 'sale.void', entityType: 'sale', entityId: String(sale.id), summary: `ยกเลิกบิล ${sale.receiptNo}`, reason })
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
  demoDb.audit({ action: 'order.pay', entityType: 'order', entityId: String(order.id), summary: `รับชำระออเดอร์ #${order.id} เป็นบิล ${sale.receiptNo}` })
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
    const user = demoDb.switchTo(1)
    if (!user) return notFound('USER_NOT_FOUND', 'ไม่พบผู้ใช้นี้')
    demoDb.audit({ action: 'auth.login', entityType: 'user', entityId: '1', summary: 'เข้าสู่ระบบ (โหมดโชว์)' })
    return ok(user)
  }),
  http.post('/api/v1/auth/logout', () => {
    demoDb.session.signedIn = false
    return ok({ ok: true })
  }),
  http.get('/api/v1/auth/me', () => (demoDb.session.signedIn ? ok(demoDb.me) : signedOut())),
  http.get('/api/v1/auth/switch-users', () => {
    const items = demoDb.switchableUsers()
    return ok({ items, total: items.length })
  }),
  http.post('/api/v1/auth/switch', async ({ request }) => {
    const body = await readBody<SwitchBody>(request)
    const verdict = demoDb.checkPin(body.userId, body.pin)
    if (verdict === 'no-pin') return problem(400, 'Bad Request', 'PIN_NOT_SET', 'ผู้ใช้นี้ยังไม่ได้ตั้ง PIN')
    if (verdict === 'invalid') return problem(400, 'Bad Request', 'PIN_INVALID', 'PIN ไม่ถูกต้อง')
    const user = demoDb.switchTo(body.userId)
    if (!user) return notFound('USER_NOT_FOUND', 'ไม่พบผู้ใช้นี้')
    demoDb.audit({ action: 'auth.switch', entityType: 'user', entityId: String(user.id), summary: `สลับผู้ขายเป็น${user.displayName}` })
    return ok(user)
  }),
  http.put('/api/v1/auth/me/pin', async ({ request }) => {
    const body = await readBody<OwnPinBody>(request)
    const meUser = demoDb.findUser(demoDb.sessionUserId)
    if (!meUser) return signedOut()
    meUser.hasPin = body.pin !== null
    demoDb.me = { ...demoDb.me, hasPin: meUser.hasPin }
    demoDb.audit({ action: body.pin === null ? 'user.pin_cleared' : 'user.pin_set', entityType: 'user', entityId: String(meUser.id), summary: 'ตั้ง PIN ของตนเอง' })
    return ok(demoDb.me)
  }),
]

const boot = [
  http.get('/api/v1/setup', () => ok({ needsSetup: false })),
  http.post('/api/v1/setup', async ({ request }) => {
    const body = await readBody<SetupBody>(request)
    demoDb.session.signedIn = true
    demoDb.sessionUserId = 1
    if (body.shopName) demoDb.settings.shopName = body.shopName
    const owner: UserResponse = { id: 1, username: body.username || 'owner', displayName: body.displayName || 'เจ้าของร้าน', role: 'owner', roleId: 1, branchId: 1, isActive: true, hasPin: true }
    demoDb.audit({ action: 'shop.setup', entityType: 'settings', entityId: 'shop', summary: 'ตั้งค่าร้านครั้งแรก (โหมดโชว์)' })
    return ok(owner)
  }),
  http.get('/api/v1/settings', () => ok(demoDb.settings)),
  http.patch('/api/v1/settings', async ({ request }) => {
    const changes = await readBody<Partial<ShopSettings>>(request)
    Object.assign(demoDb.settings, changes)
    demoDb.audit({ action: 'settings.update', entityType: 'settings', entityId: 'shop', summary: 'แก้ไขการตั้งค่าร้าน' })
    return ok(demoDb.settings)
  }),
  http.get('/api/v1/branches', () => page([branch])),
  // The shop runs on one branch: creating another is refused, and MAIN cannot be closed.
  http.post('/api/v1/branches', () => problem(409, 'Conflict', 'SINGLE_BRANCH_ONLY', 'ระบบใช้ได้สาขาเดียว')),
  http.patch('/api/v1/branches/:id', async ({ params, request }) => {
    if (Number(params.id) !== branch.id) return notFound('BRANCH_NOT_FOUND', 'ไม่พบสาขา')
    const changes = await readBody<BranchBody>(request)
    if (changes.isActive === false) return problem(409, 'Conflict', 'MAIN_BRANCH_REQUIRED', 'ปิดสาขาหลักไม่ได้')
    Object.assign(branch, { name: changes.name ?? branch.name, address: changes.address ?? branch.address, phone: changes.phone ?? branch.phone })
    demoDb.audit({ action: 'branch.update', entityType: 'branch', entityId: String(branch.id), summary: 'แก้ไขสาขาหลัก' })
    return ok(branch)
  }),
  http.get('/api/v2/capabilities', () => ok({ checkoutMode: 'shifts', imageStorage: 'enabled' })),
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
    demoDb.audit({ action: 'table.create', entityType: 'table', entityId: String(id), summary: `เพิ่มโต๊ะ ${created.name}` })
    return ok(created)
  }),
  http.patch('/api/v1/catalog/tables/:id', async ({ params, request }) => {
    const table = demoDb.findTable(Number(params.id))
    if (!table) return notFound('TABLE_NOT_FOUND', 'ไม่พบโต๊ะนี้')
    Object.assign(table, await readBody<TableBody>(request))
    demoDb.audit({ action: 'table.update', entityType: 'table', entityId: String(table.id), summary: `แก้ไขโต๊ะ ${table.name}` })
    return ok(table)
  }),
  http.post('/api/v1/catalog/categories', async ({ request }) => {
    const body = await readBody<CategoryBody>(request)
    const id = demoDb.nextCategoryId++
    const created = { id, name: body.name ?? 'หมวดใหม่', sortOrder: body.sortOrder ?? id, isActive: true }
    demoDb.categories.push(created)
    demoDb.audit({ action: 'category.create', entityType: 'category', entityId: String(id), summary: `เพิ่มหมวด ${created.name}` })
    return ok(created)
  }),
  http.patch('/api/v1/catalog/categories/:id', async ({ params, request }) => {
    const category = demoDb.categories.find((item) => item.id === Number(params.id))
    if (!category) return notFound('CATEGORY_NOT_FOUND', 'ไม่พบหมวดนี้')
    Object.assign(category, await readBody<CategoryBody>(request))
    demoDb.audit({ action: 'category.update', entityType: 'category', entityId: String(category.id), summary: `แก้ไขหมวด ${category.name}` })
    return ok(category)
  }),
  http.post('/api/v1/catalog/modifier-groups', async ({ request }) => {
    const body = await readBody<ModifierGroupBody>(request)
    const id = demoDb.nextGroupId++
    const created = {
      id,
      name: body.name ?? 'กลุ่มตัวเลือก',
      required: body.required ?? false,
      maxSelections: body.maxSelections ?? 1,
      sortOrder: body.sortOrder ?? id,
      isActive: true,
      options: [],
      productIds: [],
    }
    demoDb.modifierGroups.push(created)
    demoDb.audit({ action: 'modifier-group.create', entityType: 'modifier-group', entityId: String(id), summary: `เพิ่มกลุ่มตัวเลือก ${created.name}` })
    return ok(created)
  }),
  http.patch('/api/v1/catalog/modifier-groups/:id', async ({ params, request }) => {
    const group = demoDb.modifierGroups.find((item) => item.id === Number(params.id))
    if (!group) return notFound('MODIFIER_GROUP_NOT_FOUND', 'ไม่พบกลุ่มตัวเลือกนี้')
    Object.assign(group, await readBody<ModifierGroupBody>(request))
    demoDb.audit({ action: 'modifier-group.update', entityType: 'modifier-group', entityId: String(group.id), summary: `แก้ไขกลุ่มตัวเลือก ${group.name}` })
    return ok(group)
  }),
  http.post('/api/v1/catalog/modifier-groups/:id/options', async ({ params, request }) => {
    const group = demoDb.modifierGroups.find((item) => item.id === Number(params.id))
    if (!group) return notFound('MODIFIER_GROUP_NOT_FOUND', 'ไม่พบกลุ่มตัวเลือกนี้')
    const body = await readBody<ModifierOptionBody>(request)
    const id = demoDb.nextOptionId++
    const created = {
      id,
      groupId: group.id,
      name: body.name ?? 'ตัวเลือก',
      priceSatang: body.priceSatang ?? 0,
      costSatang: body.costSatang ?? 0,
      sortOrder: body.sortOrder ?? group.options.length + 1,
      isActive: true,
      isDefault: body.isDefault ?? false,
    }
    group.options.push(created)
    demoDb.audit({ action: 'modifier-option.create', entityType: 'modifier-option', entityId: String(id), summary: `เพิ่มตัวเลือก ${created.name}` })
    return ok(created)
  }),
  http.patch('/api/v1/catalog/modifier-options/:id', async ({ params, request }) => {
    const option = demoDb.modifierGroups.flatMap((group) => group.options).find((item) => item.id === Number(params.id))
    if (!option) return notFound('MODIFIER_OPTION_NOT_FOUND', 'ไม่พบตัวเลือกนี้')
    Object.assign(option, await readBody<ModifierOptionBody>(request))
    demoDb.audit({ action: 'modifier-option.update', entityType: 'modifier-option', entityId: String(option.id), summary: `แก้ไขตัวเลือก ${option.name}` })
    return ok(option)
  }),
  http.put('/api/v1/catalog/products/:id/modifier-groups', async ({ params, request }) => {
    const product = demoDb.findProduct(Number(params.id))
    if (!product) return notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้')
    const groupIds = (await readBody<{ groupIds: number[] }>(request)).groupIds
    for (const group of demoDb.modifierGroups) {
      group.productIds = group.productIds.filter((id) => id !== product.id)
      if (groupIds.includes(group.id)) group.productIds.push(product.id)
    }
    return ok({ groupIds })
  }),
  http.post('/api/v1/catalog/products', async ({ request }) => {
    const body = await readBody<ProductBody>(request)
    const id = demoDb.nextProductId++
    const created = {
      id,
      sku: body.sku ?? `SKU-${id}`,
      barcode: body.barcode ?? null,
      name: body.name ?? 'สินค้าใหม่',
      categoryId: body.categoryId ?? null,
      productType: body.productType ?? ('normal' as const),
      priceSatang: body.priceSatang ?? 0,
      costSatang: body.costSatang ?? 0,
      trackStock: body.trackStock ?? false,
      isActive: true,
      stockQty: 0,
      imageUrl: null as string | null,
    }
    demoDb.products.unshift(created)
    demoDb.audit({ action: 'product.create', entityType: 'product', entityId: String(id), summary: `เพิ่มสินค้า ${created.name}` })
    return ok(created)
  }),
  http.patch('/api/v1/catalog/products/:id', async ({ params, request }) => {
    const product = demoDb.findProduct(Number(params.id))
    if (!product) return notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้')
    // Stock moves through inventory only; a stray stockQty in the body is ignored like the server ignores it.
    const { ...changes } = await readBody<ProductBody & { stockQty?: number }>(request)
    delete changes.stockQty
    Object.assign(product, changes)
    demoDb.audit({ action: 'product.update', entityType: 'product', entityId: String(product.id), summary: `แก้ไขสินค้า ${product.name}` })
    return ok(product)
  }),
  http.put('/api/v1/catalog/products/:id/image', async ({ params, request }) => {
    const product = demoDb.findProduct(Number(params.id))
    if (!product) return notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้')
    await readUploadedFile(request)
    product.imageUrl = nextDemoImage(productImages)
    demoDb.audit({ action: 'product.image', entityType: 'product', entityId: String(product.id), summary: `อัปโหลดรูป ${product.name}` })
    return ok(product)
  }),
  http.delete('/api/v1/catalog/products/:id/image', ({ params }) => {
    const product = demoDb.findProduct(Number(params.id))
    if (!product) return notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้')
    product.imageUrl = null
    demoDb.audit({ action: 'product.image', entityType: 'product', entityId: String(product.id), summary: `ลบรูป ${product.name}` })
    return ok(product)
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
    demoDb.audit({ action: 'member.create', entityType: 'member', entityId: String(id), summary: `สมัครสมาชิก${created.name}` })
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
    demoDb.audit({ action: 'member.update', entityType: 'member', entityId: String(member.id), summary: `แก้ไขสมาชิก${member.name}` })
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
    demoDb.audit({ action: 'promotion.create', entityType: 'promotion', entityId: String(created.id), summary: `สร้างโปรโมชัน ${created.name}` })
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
    demoDb.audit({ action: 'promotion.update', entityType: 'promotion', entityId: String(promotion.id), summary: `แก้ไขโปรโมชัน ${promotion.name}` })
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
    demoDb.audit({ action: 'order.open', entityType: 'order', entityId: String(built.order.id), summary: `เปิดออเดอร์ #${built.order.id}` })
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
    demoDb.audit({ action: 'order.cancel', entityType: 'order', entityId: String(order.id), summary: `ยกเลิกออเดอร์ #${order.id}` })
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
    demoDb.audit({ action: 'register.create', entityType: 'register', entityId: String(created.id), summary: `เพิ่มจุดขาย ${created.name}` })
    return ok(created)
  }),
  http.patch('/api/v2/registers/:id', async ({ params, request }) => {
    const register = demoDb.findRegister(Number(params.id))
    if (!register) return notFound('REGISTER_NOT_FOUND', 'ไม่พบจุดขายนี้')
    Object.assign(register, await readBody<{ name?: string; isActive?: boolean }>(request))
    demoDb.audit({ action: 'register.update', entityType: 'register', entityId: String(register.id), summary: `แก้ไขจุดขาย ${register.name}` })
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
    demoDb.audit({ action: 'shift.open', entityType: 'shift', entityId: String(created.id), summary: `เปิดกะจุดขาย #${created.registerId}` })
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
    demoDb.audit({ action: 'shift.cash', entityType: 'shift', entityId: String(shiftId), summary: `${body.kind === 'cash_in' ? 'นำเงินเข้า' : 'นำเงินออก'} ${body.amountSatang / 100} บาท` })
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
    demoDb.audit({ action: 'shift.start_closing', entityType: 'shift', entityId: String(shift.id), summary: `เริ่มนับเงินปิดกะ #${shift.id}` })
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
    demoDb.audit({ action: 'shift.close', entityType: 'shift', entityId: String(shift.id), summary: `ปิดกะ #${shift.id}` })
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
    demoDb.audit({ action: 'sale.refund', entityType: 'sale', entityId: String(sale.id), summary: `คืนเงินบิล #${sale.id}`, reason: body.reason })
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
    demoDb.audit({ action: 'qr.dismiss', entityType: 'qr-payment', entityId: String(params.id), summary: 'ตัดยอด QR ที่ธนาคารยืนยันแล้ว', reason: body.reason })
    return ok({ ...cannedQrV2(Number(params.id)), status: 'cancelled' as const, dismissedAt: new Date(), dismissReason: body.reason })
  }),
]

const stock = [
  http.get('/api/v1/inventory/movements', ({ request }) => {
    const query = new URL(request.url).searchParams
    const productId = query.get('productId')
    let items = demoDb.movements
    if (productId !== null) items = items.filter((entry) => entry.productId === Number(productId))
    const total = items.length
    const limit = query.get('limit')
    if (limit !== null) items = items.slice(Number(query.get('offset') ?? 0), Number(query.get('offset') ?? 0) + Number(limit))
    return ok({ items, total })
  }),
  http.post('/api/v1/inventory/receive', async ({ request }) => {
    const body = await readBody<ReceiveBody>(request)
    const product = demoDb.findProduct(body.productId)
    if (!product) return notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้')
    if (product.trackStock) product.stockQty += body.quantity
    const movement = buildMovement(demoDb.nextMovementId++, {
      productId: product.id, type: 'receive', quantity: body.quantity, balanceAfter: product.stockQty, note: body.note,
    }, demoDb.actor())
    demoDb.movements.unshift(movement)
    demoDb.audit({ action: 'inventory.receive', entityType: 'product', entityId: String(product.id), summary: `รับ${product.name} ${body.quantity} ชิ้น` })
    return ok(movement)
  }),
  http.post('/api/v1/inventory/adjust', async ({ request }) => {
    const body = await readBody<AdjustBody>(request)
    const product = demoDb.findProduct(body.productId)
    if (!product) return notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้')
    const quantity = product.trackStock ? body.countedQty - product.stockQty : 0
    if (product.trackStock) product.stockQty = body.countedQty
    const movement = buildMovement(demoDb.nextMovementId++, {
      productId: product.id, type: 'adjust', quantity, balanceAfter: product.stockQty, note: body.note,
    }, demoDb.actor())
    demoDb.movements.unshift(movement)
    demoDb.audit({ action: 'inventory.adjust', entityType: 'product', entityId: String(product.id), summary: `นับสต็อก${product.name} ได้ ${body.countedQty} ชิ้น` })
    return ok(movement)
  }),
  http.get('/api/v1/inventory/receipts', ({ request }) => {
    const query = new URL(request.url).searchParams
    const items = demoDb.receipts
    const total = items.length
    const limit = query.get('limit')
    const offset = Number(query.get('offset') ?? 0)
    return ok({ items: limit === null ? items : items.slice(offset, offset + Number(limit)), total })
  }),
  http.post('/api/v1/inventory/receipts', async ({ request }) => {
    const body = await readBody<BatchReceiptBody>(request)
    if (!body.items || body.items.length === 0) return problem(400, 'Bad Request', 'RECEIPT_EMPTY', 'ใบรับต้องมีอย่างน้อย 1 รายการ')
    const { receipt, balances } = buildReceipt(demoDb.nextReceiptId++, demoDb.products, body.items, body.note, demoDb.actor())
    for (const [productId, balanceAfter] of balances) {
      const product = demoDb.findProduct(productId)
      if (product?.trackStock) product.stockQty = balanceAfter
    }
    demoDb.receipts.unshift(receipt)
    demoDb.audit({ action: 'inventory.receipt', entityType: 'receipt', entityId: String(receipt.id), summary: `รับสินค้า ${receipt.items.length} รายการ` })
    return ok(receipt)
  }),
  http.get('/api/v1/inventory/receipts/:id', ({ params }) => {
    const found = demoDb.findReceipt(Number(params.id))
    return found ? ok(found) : notFound('RECEIPT_NOT_FOUND', 'ไม่พบใบรับนี้')
  }),
]

const reports = [
  http.get('/api/v1/sales/reports', ({ request }) => {
    const query = new URL(request.url).searchParams
    const from = query.get('from') ?? new Date().toISOString().slice(0, 10)
    const to = query.get('to') ?? from
    const scope = query.get('scope') === 'all' ? 'all' : 'branch'
    return ok(buildReportOverview(demoDb.reportDeps(), demoDb.sales, { from, to, timeZone: demoDb.settings.timeZone, scope }))
  }),
  http.get('/api/v1/sales/reports/products', ({ request }) => {
    const query = new URL(request.url).searchParams
    const from = query.get('from') ?? new Date().toISOString().slice(0, 10)
    const to = query.get('to') ?? from
    const items = buildReportProducts(demoDb.sales, { from, to })
    const total = items.length
    const offset = Number(query.get('offset') ?? 0)
    const limit = query.get('limit')
    return ok({ items: limit === null ? items : items.slice(offset, offset + Number(limit)), total })
  }),
  http.get('/api/v1/sales/reports/branches', ({ request }) => {
    const query = new URL(request.url).searchParams
    const from = query.get('from') ?? new Date().toISOString().slice(0, 10)
    const to = query.get('to') ?? from
    const items = buildReportBranches(demoDb.reportDeps(), demoDb.sales, { from, to, branchId: branch.id, branchName: branch.name })
    return ok({ items, total: items.length })
  }),
]

const roles = [
  http.get('/api/v1/roles', ({ request }) => {
    const query = new URL(request.url).searchParams
    const items = demoDb.roles.map((role) => ({ ...role, userCount: demoDb.roleUserCount(role.id) }))
    const total = items.length
    const offset = Number(query.get('offset') ?? 0)
    const limit = query.get('limit')
    return ok({ items: limit === null ? items : items.slice(offset, offset + Number(limit)), total })
  }),
  http.post('/api/v1/roles', async ({ request }) => {
    const body = await readBody<RoleBody>(request)
    const created = { id: demoDb.nextRoleId++, name: body.name ?? 'บทบาทใหม่', permissions: body.permissions ?? [], systemKey: null as null, userCount: 0 }
    demoDb.roles.push(created)
    demoDb.audit({ action: 'role.create', entityType: 'role', entityId: String(created.id), summary: `สร้างบทบาท ${created.name}` })
    return ok(created)
  }),
  http.patch('/api/v1/roles/:id', async ({ params, request }) => {
    const role = demoDb.findRole(Number(params.id))
    if (!role) return notFound('ROLE_NOT_FOUND', 'ไม่พบบทบาท')
    const changes = await readBody<RoleBody>(request)
    if (changes.name !== undefined) role.name = changes.name
    if (changes.permissions !== undefined) role.permissions = changes.permissions
    role.userCount = demoDb.roleUserCount(role.id)
    demoDb.audit({ action: 'role.update', entityType: 'role', entityId: String(role.id), summary: `แก้ไขบทบาท ${role.name}` })
    return ok({ ...role })
  }),
  http.delete('/api/v1/roles/:id', ({ params }) => {
    const role = demoDb.findRole(Number(params.id))
    if (!role) return notFound('ROLE_NOT_FOUND', 'ไม่พบบทบาท')
    if (role.systemKey !== null) return problem(409, 'Conflict', 'ROLE_PROTECTED', 'บทบาทของระบบลบไม่ได้')
    if (demoDb.roleUserCount(role.id) > 0) return problem(409, 'Conflict', 'ROLE_IN_USE', 'มีผู้ใช้ถือบทบาทนี้อยู่')
    demoDb.roles = demoDb.roles.filter((item) => item.id !== role.id)
    demoDb.audit({ action: 'role.delete', entityType: 'role', entityId: String(role.id), summary: `ลบบทบาท ${role.name}` })
    return ok({ ok: true })
  }),
]

const users = [
  http.get('/api/v1/users', () => {
    const items = demoDb.users
    return ok({ items, total: items.length })
  }),
  http.post('/api/v1/users', async ({ request }) => {
    const body = await readBody<UserCreateBody>(request)
    if (demoDb.users.some((user) => user.username === body.username))
      return problem(409, 'Conflict', 'USERNAME_TAKEN', 'ชื่อผู้ใช้นี้มีแล้ว')
    const roleId = body.roleId ?? (body.role === 'owner' ? 1 : 2)
    const created: UserResponse = {
      id: demoDb.nextUserId++,
      username: body.username,
      displayName: body.displayName,
      role: roleId === 1 ? 'owner' : 'cashier',
      roleId,
      branchId: body.branchId ?? 1,
      isActive: true,
      hasPin: false,
    }
    demoDb.users.push(created)
    demoDb.audit({ action: 'user.create', entityType: 'user', entityId: String(created.id), summary: `เพิ่มผู้ใช้ ${created.displayName}` })
    return ok(created)
  }),
  http.patch('/api/v1/users/:id', async ({ params, request }) => {
    const user = demoDb.findUser(Number(params.id))
    if (!user) return notFound('USER_NOT_FOUND', 'ไม่พบผู้ใช้')
    const changes = await readBody<UserChangesBody>(request)
    const nextRole: 'owner' | 'cashier' = changes.roleId === 1 || changes.role === 'owner' ? 'owner'
      : changes.roleId !== undefined || changes.role !== undefined ? 'cashier' : user.role
    const nextActive = changes.isActive ?? user.isActive
    // The shop must keep at least one active owner, like the server enforces.
    if (user.role === 'owner' && (nextRole !== 'owner' || !nextActive) && demoDb.activeOwnersExcept(user.id).length === 0)
      return problem(409, 'Conflict', 'LAST_OWNER', 'ต้องมีเจ้าของร้านที่ใช้งานได้อย่างน้อย 1 คน')
    if (changes.displayName !== undefined) user.displayName = changes.displayName
    if (changes.roleId !== undefined) user.roleId = changes.roleId
    user.role = nextRole
    if (changes.branchId !== undefined) user.branchId = changes.branchId
    user.isActive = nextActive
    demoDb.audit({ action: 'user.update', entityType: 'user', entityId: String(user.id), summary: `แก้ไขผู้ใช้ ${user.displayName}` })
    return ok({ ...user })
  }),
  http.put('/api/v1/users/:id/pin', async ({ params, request }) => {
    const user = demoDb.findUser(Number(params.id))
    if (!user) return notFound('USER_NOT_FOUND', 'ไม่พบผู้ใช้')
    const actor = demoDb.findUser(demoDb.sessionUserId)
    if (user.role === 'owner' && actor?.role !== 'owner')
      return problem(403, 'Forbidden', 'OWNER_PIN_SELF_ONLY', 'PIN ของเจ้าของร้านตั้งได้เฉพาะเจ้าของเอง')
    user.hasPin = (await readBody<PinBody>(request)).pin !== null
    demoDb.audit({ action: user.hasPin ? 'user.pin_set' : 'user.pin_cleared', entityType: 'user', entityId: String(user.id), summary: `ตั้ง PIN ของ${user.displayName}` })
    return ok({ ...user })
  }),
]

const audit = [
  http.get('/api/v1/audit-logs', ({ request }) => {
    const query = new URL(request.url).searchParams
    const action = query.get('action')
    const entityType = query.get('entityType')
    const entityId = query.get('entityId')
    const actorId = query.get('actorId')
    const from = query.get('from')
    const to = query.get('to')
    const items = demoDb.auditLogs.filter((entry) => {
      if (action !== null && entry.action !== action) return false
      if (entityType !== null && entry.entityType !== entityType) return false
      if (entityId !== null && entry.entityId !== entityId) return false
      if (actorId !== null && entry.actorId !== Number(actorId)) return false
      if (from !== null && entry.at < new Date(`${from}T00:00:00+07:00`)) return false
      if (to !== null && entry.at >= new Date(`${to}T00:00:00+07:00`)) return false
      return true
    })
    const total = items.length
    const offset = Number(query.get('offset') ?? 0)
    const limit = query.get('limit')
    return ok({ items: limit === null ? items : items.slice(offset, offset + Number(limit)), total })
  }),
]

const displays = [
  // The customer's screen asks for a pairing code; the sale itself still travels over the
  // browser channel, and the SSE stream is left to bypass (EventSource is not fetch).
  http.post('/api/v1/customer-display/sessions', () => {
    const now = new Date()
    return ok({ token: 'demo-display-token', code: '123456', expiresAt: new Date(now.getTime() + 10 * 60_000) })
  }),
  http.get('/api/v1/customer-display/pair', () => ok({ displays: demoDb.pairedDisplays })),
  http.post('/api/v1/customer-display/pair', async ({ request }) => {
    await readBody<PairBody>(request)
    demoDb.pairedDisplays = 1
    return ok({ displays: 1 })
  }),
  http.delete('/api/v1/customer-display/pair', () => {
    demoDb.pairedDisplays = 0
    return ok({ displays: 0 })
  }),
  http.put('/api/v1/customer-display/state', () => ok({ displays: demoDb.pairedDisplays })),
  http.get('/api/v1/display-slides', () => {
    const items = demoDb.slides.filter((slide) => slide.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
    return ok({ items, total: items.length })
  }),
  http.get('/api/v1/display-slides/all', () => {
    const items = [...demoDb.slides].sort((a, b) => a.sortOrder - b.sortOrder)
    return ok({ items, total: items.length })
  }),
  http.post('/api/v1/display-slides', async ({ request }) => {
    await readUploadedFile(request)
    const created = {
      id: demoDb.nextSlideId++,
      imageUrl: nextDemoImage(slideImages),
      sortOrder: demoDb.slides.reduce((max, slide) => Math.max(max, slide.sortOrder), 0) + 1,
      isActive: true,
    }
    demoDb.slides.push(created)
    demoDb.audit({ action: 'slide.upload', entityType: 'slide', entityId: String(created.id), summary: 'อัปโหลดรูปสไลด์จอลูกค้า' })
    return ok(created)
  }),
  http.patch('/api/v1/display-slides/:id', async ({ params, request }) => {
    const slide = demoDb.findSlide(Number(params.id))
    if (!slide) return notFound('SLIDE_NOT_FOUND', 'ไม่พบสไลด์นี้')
    Object.assign(slide, await readBody<SlideBody>(request))
    return ok({ ...slide })
  }),
  http.delete('/api/v1/display-slides/:id', ({ params }) => {
    const slide = demoDb.findSlide(Number(params.id))
    if (!slide) return notFound('SLIDE_NOT_FOUND', 'ไม่พบสไลด์นี้')
    demoDb.slides = demoDb.slides.filter((item) => item.id !== slide.id)
    demoDb.audit({ action: 'slide.delete', entityType: 'slide', entityId: String(slide.id), summary: 'ลบรูปสไลด์จอลูกค้า' })
    return ok({ ok: true })
  }),
]

const cafeMenu = [
  http.post('/api/v1/cafe-menu', async ({ request }) => {
    const body = await readBody<CafeMenuBody>(request)
    return ok(appliedCafeMenu(body.itemKeys ?? []))
  }),
]

// `reports` stays ahead of `sales`: MSW matches in order, and `/sales/reports`
// would otherwise be caught by `/sales/:id`.
export const handlers: RequestHandler[] = [...auth, ...boot, ...catalog, ...members, ...promotions, ...reports, ...sales, ...orders, ...qrLegacy, ...shifts, ...stock, ...roles, ...users, ...audit, ...displays, ...cafeMenu]
