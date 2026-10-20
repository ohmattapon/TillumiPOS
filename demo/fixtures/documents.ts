import { calculateTotals } from '@pos/api/pricing'
import { pickBestPromotion } from '@pos/api/promotions'
import type { Member, ModifierGroup, Order, Product, Sale, SaleSummary, ShopSettings } from '@pos/api/types'
import type { PromotionResponse } from '../../server/src/modules/promotions/adapters/controllers/schemas/promotion.schema'
import type { QuoteResponse } from '../../server/src/modules/quotes/adapters/controllers/schemas/quote.schema'
import type { shiftHttpSchemas } from '../../server/src/modules/shifts/adapters/controllers/schemas/shift.schema'
import type { DemoShift } from './shop'

export type DemoCashEntry = typeof shiftHttpSchemas.cashEntry.static
export type DemoShiftSummary = typeof shiftHttpSchemas.summary.static

export interface BillLineInput {
  productId: number
  quantity: number
  options?: number[]
}

export interface BillPaymentInput {
  method: 'cash' | 'promptpay' | 'card'
  amountSatang: number
  qrPaymentId?: number
}

export interface CatalogDeps {
  products: Product[]
  groups: ModifierGroup[]
  promotions: PromotionResponse[]
  members: Member[]
  settings: ShopSettings
}

type SaleLineOption = Sale['items'][number]['options'][number]

function findProduct(products: Product[], id: number): Product {
  const found = products.find((item) => item.id === id)
  if (!found) throw new Error(`unknown demo product ${id}`)
  return found
}

function resolveOptions(groups: ModifierGroup[], optionIds: readonly number[]): SaleLineOption[] {
  const byId = new Map(groups.flatMap((group) => group.options.map((option) => [option.id, { group, option }] as const)))
  return optionIds.flatMap((id) => {
    const hit = byId.get(id)
    if (!hit || !hit.option.isActive) return []
    return [{ groupId: hit.group.id, groupName: hit.group.name, optionId: hit.option.id, name: hit.option.name, priceSatang: hit.option.priceSatang }]
  })
}

/** One priced line; the unit price already includes its options, like the server keeps it. */
export function priceLine(
  deps: Pick<CatalogDeps, 'products' | 'groups'>,
  input: BillLineInput,
): { product: Product; unitPriceSatang: number; options: SaleLineOption[]; lineTotalSatang: number } {
  const product = findProduct(deps.products, input.productId)
  const options = resolveOptions(deps.groups, input.options ?? [])
  const unitPriceSatang = product.priceSatang + options.reduce((sum, option) => sum + option.priceSatang, 0)
  return { product, unitPriceSatang, options, lineTotalSatang: unitPriceSatang * input.quantity }
}

interface PricedCart {
  items: Sale['items']
  subtotalSatang: number
  member: Sale['member']
  promotion: Sale['promotion']
  discountSatang: number
}

function priceCart(
  deps: CatalogDeps,
  lines: readonly BillLineInput[],
  typedDiscountSatang: number,
  memberId: number | null | undefined,
  at: Date,
): PricedCart {
  const items: Sale['items'] = lines.map((line) => {
    const priced = priceLine(deps, line)
    return {
      productId: priced.product.id,
      productName: priced.product.name,
      sku: priced.product.sku,
      unitPriceSatang: priced.unitPriceSatang,
      quantity: line.quantity,
      lineTotalSatang: priced.lineTotalSatang,
      options: priced.options,
    }
  })
  const subtotalSatang = items.reduce((sum, item) => sum + item.lineTotalSatang, 0)
  const memberRow = memberId == null ? null : (deps.members.find((item) => item.id === memberId) ?? null)
  const member = memberRow ? { id: memberRow.id, code: memberRow.code, name: memberRow.name } : null
  // A promotion and a typed discount never stack: the bill takes whichever discounts more.
  const best = pickBestPromotion(
    deps.promotions,
    {
      subtotalSatang,
      hasMember: member !== null,
      at,
      timeZone: deps.settings.timeZone,
      lines: items.map((item) => ({ productId: item.productId, categoryId: deps.products.find((p) => p.id === item.productId)?.categoryId ?? null, lineTotalSatang: item.lineTotalSatang })),
    },
  )
  const promoDiscount = best?.discountSatang ?? 0
  const usePromo = promoDiscount > typedDiscountSatang
  return {
    items,
    subtotalSatang,
    member,
    promotion: usePromo && best
      ? { id: best.promotion.id, name: best.promotion.name, kind: best.promotion.kind, value: best.promotion.value, maxDiscountSatang: best.promotion.maxDiscountSatang, discountSatang: best.discountSatang }
      : null,
    discountSatang: usePromo ? promoDiscount : typedDiscountSatang,
  }
}

export interface BuildSaleInput {
  id: number
  receiptNo: string
  items: BillLineInput[]
  discountSatang: number
  payments: BillPaymentInput[]
  memberId?: number | null
  /** A pinned price: the bill is made at it, like the server would. */
  quote?: QuoteResponse | null
  shiftId?: number
  createdAt: Date
}

/** A complete bill with consistent totals; credit the shared pricing rule, never hand math. */
export function buildSale(deps: CatalogDeps, input: BuildSaleInput): Sale {
  const cart: PricedCart = input.quote
    ? {
      items: input.quote.lines.map((line) => ({ ...line, lineTotalSatang: line.unitPriceSatang * line.quantity })),
      subtotalSatang: input.quote.subtotalSatang,
      member: input.quote.member,
      promotion: input.quote.promotion,
      discountSatang: input.quote.discountSatang,
    }
    : priceCart(deps, input.items, input.discountSatang, input.memberId, input.createdAt)
  const { vatSatang, totalSatang } = calculateTotals({
    subtotalSatang: cart.subtotalSatang,
    discountSatang: cart.discountSatang,
    vatMode: deps.settings.vatMode,
    vatRateBp: deps.settings.vatRateBp,
  })
  const paidSatang = input.payments.reduce((sum, payment) => sum + payment.amountSatang, 0)
  return {
    id: input.id,
    receiptNo: input.receiptNo,
    status: 'completed',
    member: cart.member,
    promotion: cart.promotion,
    subtotalSatang: cart.subtotalSatang,
    discountSatang: cart.discountSatang,
    totalSatang,
    vatSatang,
    vatMode: deps.settings.vatMode,
    vatRateBp: deps.settings.vatRateBp,
    branchId: 1,
    paidSatang,
    changeSatang: paidSatang - totalSatang,
    cashierId: 1,
    cashierName: 'เจ้าของร้าน',
    shopName: deps.settings.shopName,
    shopTaxId: deps.settings.taxId,
    branchName: null,
    shopAddress: deps.settings.address,
    shopPhone: deps.settings.phone,
    voidedAt: null,
    voidReason: null,
    createdAt: input.createdAt,
    items: cart.items,
    payments: input.payments.map((payment) => ({ method: payment.method, amountSatang: payment.amountSatang })),
  }
}

export interface BuildQuoteInput {
  id: number
  lines: BillLineInput[]
  memberId?: number | null
  orderId?: number
  createdAt: Date
}

/** A pinned price for the cart, expiring in 15 minutes like the server's open quotes. */
export function buildQuote(deps: CatalogDeps, input: BuildQuoteInput): QuoteResponse {
  const cart = priceCart(deps, input.lines, 0, input.memberId, input.createdAt)
  const { vatSatang, totalSatang } = calculateTotals({
    subtotalSatang: cart.subtotalSatang,
    discountSatang: cart.discountSatang,
    vatMode: deps.settings.vatMode,
    vatRateBp: deps.settings.vatRateBp,
  })
  return {
    id: input.id,
    branchId: 1,
    memberId: cart.member?.id ?? null,
    member: cart.member,
    orderId: input.orderId ?? null,
    lines: cart.items.map(({ lineTotalSatang: _dropped, ...line }) => line),
    subtotalSatang: cart.subtotalSatang,
    promotion: cart.promotion,
    discountSatang: cart.discountSatang,
    vatMode: deps.settings.vatMode,
    vatRateBp: deps.settings.vatRateBp,
    vatSatang,
    totalSatang,
    status: 'open',
    expiresAt: new Date(input.createdAt.getTime() + 15 * 60_000),
    createdAt: input.createdAt,
  }
}

export interface BuildOrderInput {
  id: number
  label: string | null
  tableId: number | null
  memberId?: number | null
  lines: (BillLineInput & { note?: string | null })[]
  status?: Order['status']
  createdAt: Date
}

/** An open order; prices are snapshots taken when the lines are added. */
export function buildOrder(deps: Pick<CatalogDeps, 'products' | 'groups'>, input: BuildOrderInput, firstLineId: number): { order: Order; nextLineId: number } {
  let lineId = firstLineId
  const items: Order['items'] = input.lines.map((line) => {
    const priced = priceLine(deps, line)
    const item: Order['items'][number] = {
      lineId: lineId++,
      productId: priced.product.id,
      productName: priced.product.name,
      sku: priced.product.sku,
      unitPriceSatang: priced.unitPriceSatang,
      quantity: line.quantity,
      lineTotalSatang: priced.lineTotalSatang,
      options: priced.options,
      note: line.note ?? null,
    }
    return item
  })
  return {
    order: {
      id: input.id,
      branchId: 1,
      label: input.label,
      tableId: input.tableId,
      memberId: input.memberId ?? null,
      status: input.status ?? 'open',
      openedById: 1,
      openedByName: 'เจ้าของร้าน',
      saleId: null,
      cancelReason: null,
      mergedIntoId: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotalSatang: items.reduce((sum, item) => sum + item.lineTotalSatang, 0),
    },
    nextLineId: lineId,
  }
}

const minute = 60_000

/** Fifteen bills across today, one of them voided, with payments that cover their totals. */
export function salesTodaySeed(deps: CatalogDeps): Sale[] {
  const now = Date.now()
  const at = (minutesAgo: number) => new Date(now - minutesAgo * minute)
  const rows: Array<Omit<BuildSaleInput, 'id' | 'receiptNo' | 'createdAt'> & { minutesAgo: number }> = [
    { minutesAgo: 420, items: [{ productId: 2, quantity: 2, options: [2, 9] }], discountSatang: 0, payments: [{ method: 'cash', amountSatang: 20000 }] },
    { minutesAgo: 395, items: [{ productId: 8, quantity: 1, options: [2, 10, 5] }, { productId: 31, quantity: 1 }], discountSatang: 0, payments: [{ method: 'cash', amountSatang: 20000 }] },
    { minutesAgo: 360, items: [{ productId: 19, quantity: 2, options: [3, 11] }], discountSatang: 0, payments: [{ method: 'promptpay', amountSatang: 18000 }], memberId: 1 },
    { minutesAgo: 330, items: [{ productId: 40, quantity: 1 }, { productId: 34, quantity: 2 }], discountSatang: 0, payments: [{ method: 'card', amountSatang: 42300 }] },
    { minutesAgo: 300, items: [{ productId: 13, quantity: 1, options: [2, 10] }, { productId: 37, quantity: 2 }], discountSatang: 0, payments: [{ method: 'cash', amountSatang: 20000 }] },
    { minutesAgo: 275, items: [{ productId: 3, quantity: 1, options: [1, 9] }, { productId: 33, quantity: 1 }], discountSatang: 0, payments: [{ method: 'cash', amountSatang: 10000 }] },
    { minutesAgo: 250, items: [{ productId: 26, quantity: 1 }, { productId: 39, quantity: 1 }], discountSatang: 0, payments: [{ method: 'cash', amountSatang: 15000 }] },
    { minutesAgo: 220, items: [{ productId: 21, quantity: 3, options: [1, 9] }], discountSatang: 0, payments: [{ method: 'promptpay', amountSatang: 16500 }] },
    { minutesAgo: 190, items: [{ productId: 41, quantity: 1 }, { productId: 42, quantity: 1 }], discountSatang: 0, payments: [{ method: 'card', amountSatang: 51300 }], memberId: 2 },
    { minutesAgo: 160, items: [{ productId: 10, quantity: 2, options: [2, 10, 6] }, { productId: 38, quantity: 1 }], discountSatang: 1000, payments: [{ method: 'cash', amountSatang: 30000 }] },
    { minutesAgo: 130, items: [{ productId: 24, quantity: 4 }], discountSatang: 0, payments: [{ method: 'cash', amountSatang: 10000 }] },
    { minutesAgo: 100, items: [{ productId: 18, quantity: 1, options: [2, 9] }, { productId: 32, quantity: 1 }, { productId: 36, quantity: 1 }], discountSatang: 0, payments: [{ method: 'promptpay', amountSatang: 21000 }] },
    { minutesAgo: 70, items: [{ productId: 7, quantity: 1, options: [3, 9] }], discountSatang: 0, payments: [{ method: 'cash', amountSatang: 10000 }] },
    { minutesAgo: 40, items: [{ productId: 16, quantity: 2, options: [1, 10] }, { productId: 35, quantity: 1 }], discountSatang: 0, payments: [{ method: 'cash', amountSatang: 20000 }] },
    { minutesAgo: 15, items: [{ productId: 29, quantity: 1, options: [1, 9] }, { productId: 30, quantity: 1, options: [4, 10] }], discountSatang: 0, payments: [{ method: 'cash', amountSatang: 20000 }] },
  ]
  return rows.map((row, index) => {
    const { minutesAgo, ...input } = row
    return buildSale(deps, { ...input, id: index + 1, receiptNo: `MAIN-${String(index + 1).padStart(6, '0')}`, createdAt: at(minutesAgo) })
  })
}

/** Three open orders, two on tables and one takeaway with a member. */
export function ordersSeed(deps: Pick<CatalogDeps, 'products' | 'groups'>): Order[] {
  const now = Date.now()
  const inputs: BuildOrderInput[] = [
    {
      id: 1,
      label: null,
      tableId: 1,
      lines: [
        { productId: 8, quantity: 2, options: [2, 10], note: 'แยกน้ำแข็ง' },
        { productId: 31, quantity: 1 },
      ],
      createdAt: new Date(now - 50 * minute),
    },
    {
      id: 2,
      label: null,
      tableId: 3,
      lines: [
        { productId: 19, quantity: 1, options: [3, 11, 5] },
        { productId: 16, quantity: 2, options: [1, 10] },
        { productId: 38, quantity: 1 },
      ],
      createdAt: new Date(now - 25 * minute),
    },
    {
      id: 3,
      label: 'สั่งกลับบ้าน',
      tableId: null,
      memberId: 1,
      lines: [{ productId: 2, quantity: 1, options: [3, 9] }],
      createdAt: new Date(now - 10 * minute),
    },
  ]
  let nextLineId = 1
  return inputs.map((input) => {
    const built = buildOrder(deps, input, nextLineId)
    nextLineId = built.nextLineId
    return built.order
  })
}

/** The owner-facing day summary, from the completed bills only. */
export function summarizeSales(sales: Sale[]): SaleSummary {
  const completed = sales.filter((sale) => sale.status === 'completed')
  const totalSatang = completed.reduce((sum, sale) => sum + sale.totalSatang, 0)
  const byMethod = new Map<'cash' | 'promptpay' | 'card', number>()
  for (const sale of completed) {
    const cashPaid = sale.payments.filter((p) => p.method === 'cash').reduce((sum, p) => sum + p.amountSatang, 0)
    // Cash kept is what was tendered minus the change handed back.
    byMethod.set('cash', (byMethod.get('cash') ?? 0) + cashPaid - sale.changeSatang)
    for (const method of ['promptpay', 'card'] as const)
      byMethod.set(method, (byMethod.get(method) ?? 0) + sale.payments.filter((p) => p.method === method).reduce((sum, p) => sum + p.amountSatang, 0))
  }
  return {
    saleCount: completed.length,
    totalSatang,
    vatSatang: completed.reduce((sum, sale) => sum + sale.vatSatang, 0),
    discountSatang: completed.reduce((sum, sale) => sum + sale.discountSatang, 0),
    profitSatang: Math.round(totalSatang * 0.4),
    byMethod: [...byMethod].filter(([, amountSatang]) => amountSatang > 0).map(([method, amountSatang]) => ({ method, amountSatang })),
  }
}

/** The shift report, worked out from the same bills and entries the pages list. */
export function summarizeShift(sales: Sale[], entries: DemoCashEntry[], shift: DemoShift): DemoShiftSummary {
  const completed = sales.filter((sale) => sale.status === 'completed')
  const voided = sales.filter((sale) => sale.status === 'voided')
  const grossSalesSatang = sales.reduce((sum, sale) => sum + sale.totalSatang, 0)
  const voidedSatang = voided.reduce((sum, sale) => sum + sale.totalSatang, 0)
  const summary = summarizeSales(sales)
  const cashInSatang = entries.filter((e) => e.kind === 'cash_in').reduce((sum, e) => sum + e.amountSatang, 0)
  const cashOutSatang = entries.filter((e) => e.kind === 'cash_out').reduce((sum, e) => sum + e.amountSatang, 0)
  const cashSaleSatang = summary.byMethod.find((row) => row.method === 'cash')?.amountSatang ?? 0
  return {
    frozen: false,
    capturedAt: null,
    summary: {
      saleCount: completed.length,
      grossSalesSatang,
      voidedCount: voided.length,
      voidedSatang,
      netSalesSatang: grossSalesSatang - voidedSatang,
      changeSatang: completed.reduce((sum, sale) => sum + sale.changeSatang, 0),
      tendered: summary.byMethod,
      cashSaleSatang,
      cashInSatang,
      cashOutSatang,
      cashRefundSatang: 0,
      openingCashSatang: shift.openingCashSatang,
      expectedCashSatang: shift.openingCashSatang + cashSaleSatang + cashInSatang - cashOutSatang,
    },
    voidedAfterCutoff: { count: 0, amountSatang: 0 },
  }
}

/** One open shift on TILL-01 plus two closed ones from yesterday. */
export function shiftsSeed(): DemoShift[] {
  const now = Date.now()
  const day = 24 * 60 * minute
  return [
    {
      id: 1,
      branchId: 1,
      registerId: 1,
      status: 'open',
      openedAt: new Date(now - 4 * 60 * minute),
      openedById: 1,
      openedByName: 'เจ้าของร้าน',
      openingCashSatang: 500000,
      openingNote: null,
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
    },
    {
      id: 2,
      branchId: 1,
      registerId: 1,
      status: 'closed',
      openedAt: new Date(now - day - 8 * 60 * minute),
      openedById: 1,
      openedByName: 'เจ้าของร้าน',
      openingCashSatang: 500000,
      openingNote: null,
      currency: 'THB',
      timeZone: 'Asia/Bangkok',
      closingRevision: 2,
      closingStartedAt: new Date(now - day - 60 * minute),
      closingStartedById: 1,
      closingStartedByName: 'เจ้าของร้าน',
      closingExpectedCashSatang: 612300,
      closedAt: new Date(now - day - 30 * minute),
      closedById: 1,
      closedByName: 'เจ้าของร้าน',
      countedCashSatang: 612300,
      cashDifferenceSatang: 0,
      differenceReason: null,
    },
    {
      id: 3,
      branchId: 1,
      registerId: 2,
      status: 'closed',
      openedAt: new Date(now - day - 8 * 60 * minute),
      openedById: 1,
      openedByName: 'เจ้าของร้าน',
      openingCashSatang: 300000,
      openingNote: 'กะบ่าย',
      currency: 'THB',
      timeZone: 'Asia/Bangkok',
      closingRevision: 2,
      closingStartedAt: new Date(now - day - 90 * minute),
      closingStartedById: 1,
      closingStartedByName: 'เจ้าของร้าน',
      closingExpectedCashSatang: 358100,
      closedAt: new Date(now - day - 60 * minute),
      closedById: 1,
      closedByName: 'เจ้าของร้าน',
      countedCashSatang: 358000,
      cashDifferenceSatang: -100,
      differenceReason: 'ทอนเกิน 1 บาท',
    },
  ]
}

export function cashEntriesSeed(): DemoCashEntry[] {
  return [
    {
      id: 1,
      shiftId: 1,
      kind: 'cash_in',
      amountSatang: 100000,
      saleId: null,
      actorId: 1,
      actorName: 'เจ้าของร้าน',
      reason: 'เติมเงินทอน',
      createdAt: new Date(Date.now() - 3.5 * 60 * minute),
    },
  ]
}
