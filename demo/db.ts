import type { Category, DiningTable, Member, ModifierGroup, Order, Product, Sale, ShopSettings } from '@pos/api/types'
import type { PromotionResponse } from '../server/src/modules/promotions/adapters/controllers/schemas/promotion.schema'
import type { QuoteResponse } from '../server/src/modules/quotes/adapters/controllers/schemas/quote.schema'
import {
  cashEntriesSeed,
  categories,
  me,
  members,
  modifierGroups,
  ordersSeed,
  products,
  promotions,
  registers,
  salesTodaySeed,
  settings,
  shiftsSeed,
  tables,
  type CatalogDeps,
  type DemoCashEntry,
  type DemoMe,
  type DemoRegister,
  type DemoShift,
} from './fixtures/index'

// Small typed in-memory store behind the static showcase worker: lookups by
// id, appending a sale on sell, and flagging a void. Nothing survives a reload.

export interface DemoSession {
  signedIn: boolean
}

export interface DemoDb {
  session: DemoSession
  settings: ShopSettings
  me: DemoMe
  categories: Category[]
  products: Product[]
  modifierGroups: ModifierGroup[]
  tables: DiningTable[]
  members: Member[]
  promotions: PromotionResponse[]
  orders: Order[]
  sales: Sale[]
  quotes: QuoteResponse[]
  registers: DemoRegister[]
  shifts: DemoShift[]
  cashEntries: DemoCashEntry[]
  nextOrderId: number
  nextSaleId: number
  nextQuoteId: number
  nextLineId: number
  nextMemberId: number
  nextPromotionId: number
  nextTableId: number
  nextShiftId: number
  nextEntryId: number
  nextRegisterId: number
  nextReceiptNo: number
  catalog(): CatalogDeps
  findProduct(id: number): Product | undefined
  findMember(id: number): Member | undefined
  findOrder(id: number): Order | undefined
  findSale(id: number): Sale | undefined
  findQuote(id: number): QuoteResponse | undefined
  findPromotion(id: number): PromotionResponse | undefined
  findTable(id: number): DiningTable | undefined
  findRegister(id: number): DemoRegister | undefined
  findShift(id: number): DemoShift | undefined
  currentShiftFor(registerId: number): DemoShift | undefined
  appendSale(sale: Sale): void
  markSaleVoided(id: number, reason: string): Sale | undefined
  upsertOrder(order: Order): void
  appendQuote(quote: QuoteResponse): void
  receiptNo(): string
  reset(): void
}

function seedSales(deps: CatalogDeps): Sale[] {
  const sales = salesTodaySeed(deps)
  // A voided bill from this morning, so the voided tab is alive. Totals stay:
  // a void never rewrites history, it only flags the bill.
  const doomed = sales[6]
  doomed.status = 'voided'
  doomed.voidedAt = new Date(doomed.createdAt.getTime() + 4 * 60_000)
  doomed.voidReason = 'ทำผิดรายการ'
  return sales
}

function freshDb(): Omit<DemoDb, 'catalog' | 'findProduct' | 'findMember' | 'findOrder' | 'findSale' | 'findQuote' | 'findPromotion' | 'findTable' | 'findRegister' | 'findShift' | 'currentShiftFor' | 'appendSale' | 'markSaleVoided' | 'upsertOrder' | 'appendQuote' | 'receiptNo' | 'reset'> {
  const deps: CatalogDeps = { products: structuredClone(products), groups: structuredClone(modifierGroups), promotions: structuredClone(promotions), members: structuredClone(members), settings: structuredClone(settings) }
  const orders = ordersSeed({ products: deps.products, groups: deps.groups })
  const usedLineIds = orders.flatMap((order) => order.items.map((item) => item.lineId))
  return {
    session: { signedIn: false },
    settings: structuredClone(settings),
    me: structuredClone(me),
    categories: structuredClone(categories),
    products: deps.products,
    modifierGroups: deps.groups,
    tables: structuredClone(tables),
    members: deps.members,
    promotions: deps.promotions,
    orders,
    sales: seedSales(deps),
    quotes: [],
    registers: structuredClone(registers),
    shifts: shiftsSeed(),
    cashEntries: cashEntriesSeed(),
    nextOrderId: 4,
    nextSaleId: 16,
    nextQuoteId: 1,
    nextLineId: Math.max(...usedLineIds) + 1,
    nextMemberId: 4,
    nextPromotionId: 3,
    nextTableId: 9,
    nextShiftId: 4,
    nextEntryId: 2,
    nextRegisterId: 3,
    nextReceiptNo: 16,
  }
}

function findById<T extends { id: number }>(rows: T[], id: number): T | undefined {
  return rows.find((row) => row.id === id)
}

export const demoDb: DemoDb = {
  ...freshDb(),

  catalog(): CatalogDeps {
    return { products: this.products, groups: this.modifierGroups, promotions: this.promotions, members: this.members, settings: this.settings }
  },
  findProduct(id) { return findById(this.products, id) },
  findMember(id) { return findById(this.members, id) },
  findOrder(id) { return findById(this.orders, id) },
  findSale(id) { return findById(this.sales, id) },
  findQuote(id) { return findById(this.quotes, id) },
  findPromotion(id) { return findById(this.promotions, id) },
  findTable(id) { return findById(this.tables, id) },
  findRegister(id) { return findById(this.registers, id) },
  findShift(id) { return findById(this.shifts, id) },
  currentShiftFor(registerId) {
    return this.shifts.find((shift) => shift.registerId === registerId && shift.status !== 'closed')
  },
  appendSale(sale) { this.sales.unshift(sale) },
  markSaleVoided(id, reason) {
    const sale = this.findSale(id)
    if (!sale || sale.status === 'voided') return sale
    sale.status = 'voided'
    sale.voidedAt = new Date()
    sale.voidReason = reason
    return sale
  },
  upsertOrder(order) {
    const index = this.orders.findIndex((row) => row.id === order.id)
    if (index === -1) this.orders.unshift(order)
    else this.orders[index] = order
  },
  appendQuote(quote) { this.quotes.push(quote) },
  receiptNo() { return `MAIN-${String(this.nextReceiptNo++).padStart(6, '0')}` },
  reset() {
    Object.assign(this, freshDb())
  },
}
