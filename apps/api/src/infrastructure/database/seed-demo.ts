/**
 * Demo data: three weeks of a small café-restaurant, up to now, written straight into the database with
 * the dates of the day each thing happened (the use cases always stamp "now", so they cannot backdate).
 * Everything follows the rules the use cases enforce: receipt numbers, VAT, stock ledger, drawer entries,
 * shift reports. It is for a demo database: it stops if the database already has sales.
 *
 * Usage: bun run db:seed:demo   (reads DATABASE_URL from the repo-root .env)
 */
import 'reflect-metadata'
import { count, eq, sql } from 'drizzle-orm'
import { container } from 'tsyringe'
import { calculateTotals } from '../../domains/pricing'
import { lineKey, type LineOption } from '../../domains/modifier.domain'
import { buildShiftSummary } from '../../domains/shift-summary'
import { client, db } from '../../libs/db'
import '../../modules/di-registrations'
import { CreateUserUseCase } from '../../modules/users/applications/usecases/create-user.usecase'
import { branches, branchStock } from './schema/branches'
import { categories } from './schema/categories'
import { checkoutModeState } from './schema/checkout-mode-state'
import { diningTables } from './schema/dining-tables'
import { modifierGroups, modifierOptions, productModifierGroups } from './schema/modifiers'
import { orderItems, orders } from './schema/orders'
import { products } from './schema/products'
import { qrPayments } from './schema/qr-payments'
import { registers } from './schema/registers'
import { payments, receiptCounters, saleItems, sales } from './schema/sales'
import { shiftCashEntries } from './schema/shift-cash-entries'
import { shiftSummaries } from './schema/shift-summaries'
import { shifts } from './schema/shifts'
import { shopSettings } from './schema/shop-settings'
import { stockMovements } from './schema/stock-movements'
import { users } from './schema/users'

const DAYS = 21
const HOUR = 3_600_000
const MINUTE = 60_000
const DAY = 24 * HOUR
const BANGKOK = 7 * HOUR

// ---- A repeatable pseudo-random source, so the same demo comes out every time ----
function mulberry32(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const random = mulberry32(20261014)
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
const chance = (probability: number) => random() < probability
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
function weighted<T>(items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0)
  let at = random() * total
  for (const [item, weight] of items) {
    at -= weight
    if (at < 0) return item
  }
  return items[items.length - 1]![0]
}

// ---- Guard ----
const [existing] = await db.select({ total: count() }).from(sales)
if (existing!.total > 0) {
  console.log('The database already has sales, so the demo data is not added')
  await client.close()
  process.exit(0)
}
const target = new URL(Bun.env.DATABASE_URL!)
console.log(`Adding demo data to ${target.hostname}:${target.port}${target.pathname}`)

const now = Date.now()
const startOfToday = Math.floor((now + BANGKOK) / DAY) * DAY - BANGKOK
const dayLabel = (dayStart: number) => new Date(dayStart + BANGKOK).toISOString().slice(0, 10)
const compact = (dayStart: number) => dayLabel(dayStart).replaceAll('-', '')
const at = (dayStart: number, hour: number, minute = 0) => dayStart + hour * HOUR + minute * MINUTE

// ---- The shop, branches, registers, people ----
const SHOP = {
  shopName: 'ร้านกาแฟบ้านสวน',
  taxId: '0105560012345',
  address: '99/9 ซอยสุขุมวิท 39 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',
  phone: '02-123-4567',
  receiptFooter: 'ขอบคุณที่ใช้บริการ · ติดตามโปรโมชันที่ไลน์ @bansuan',
}
await db
  .insert(shopSettings)
  .values({
    id: 1,
    ...SHOP,
    currency: 'THB',
    vatMode: 'inclusive',
    vatRateBp: 700,
    timeZone: 'Asia/Bangkok',
    locale: 'th',
    receiptPaperMm: 80,
  })
  .onConflictDoUpdate({ target: shopSettings.id, set: { ...SHOP, updatedAt: new Date() } })

const [mainBranch] = await db.select().from(branches).where(eq(branches.code, 'MAIN'))
await db
  .update(branches)
  .set({ name: 'สาขาสุขุมวิท 39', address: SHOP.address, phone: SHOP.phone })
  .where(eq(branches.id, mainBranch!.id))
const [siam] = await db
  .insert(branches)
  .values({ code: 'SIAM', name: 'สาขาสยามสแควร์', address: '256 ถนนพญาไท แขวงวังใหม่ เขตปทุมวัน กรุงเทพมหานคร 10330', phone: '02-987-6543' })
  .onConflictDoUpdate({ target: branches.code, set: { name: 'สาขาสยามสแควร์' } })
  .returning()

const BRANCHES = [
  { id: mainBranch!.id, code: 'MAIN', name: 'สาขาสุขุมวิท 39', address: SHOP.address, phone: SHOP.phone, perDay: 21, openingCash: 100_000 },
  { id: siam!.id, code: 'SIAM', name: 'สาขาสยามสแควร์', address: siam!.address, phone: siam!.phone, perDay: 9, openingCash: 80_000 },
]

const registerOf = new Map<number, number>()
for (const branch of BRANCHES) {
  const [found] = await db.select({ id: registers.id }).from(registers).where(eq(registers.branchId, branch.id))
  if (found) registerOf.set(branch.id, found.id)
  else {
    const [created] = await db
      .insert(registers)
      .values({ branchId: branch.id, code: 'POS1', name: 'เคาน์เตอร์หลัก' })
      .returning({ id: registers.id })
    registerOf.set(branch.id, created!.id)
  }
}

const [owner] = await db.select().from(users).where(eq(users.username, 'admin'))
if (!owner) throw new Error('Run db:seed first: the owner "admin" does not exist yet')

const password = Bun.env.DEMO_CASHIER_PASSWORD ?? Array.from({ length: 14 }, () => pick([...'abcdefghjkmnpqrstuvwxyz23456789'])).join('')
const createUser = container.resolve(CreateUserUseCase)
const cashiersOf = new Map<number, { id: number; name: string }[]>()
const cashierPlan = [
  { username: 'somying', displayName: 'สมหญิง ใจดี', branch: BRANCHES[0]! },
  { username: 'wichai', displayName: 'วิชัย รักงาน', branch: BRANCHES[0]! },
  { username: 'mali', displayName: 'มาลี สดใส', branch: BRANCHES[1]! },
]
for (const plan of cashierPlan) {
  const [found] = await db.select().from(users).where(eq(users.username, plan.username))
  const user =
    found ??
    (await createUser.execute({ username: plan.username, password, displayName: plan.displayName, role: 'cashier' }, plan.branch.id))
  const list = cashiersOf.get(plan.branch.id) ?? []
  list.push({ id: user.id, name: plan.displayName })
  cashiersOf.set(plan.branch.id, list)
}

// Everything below is one transaction (`db` is the transaction inside it), so a failure leaves nothing behind.
// The shop, branches, registers and people above are safe to repeat, so they are outside it.
await db.transaction(async (db) => {
// ---- Catalogue: categories, products, option groups ----
const categoryRows = await db.select().from(categories)
const categoryId = async (name: string, sortOrder: number) => {
  const found = categoryRows.find((row) => row.name === name)
  if (found) return found.id
  const [created] = await db.insert(categories).values({ name, sortOrder }).returning({ id: categories.id })
  return created!.id
}
const drinksId = await categoryId('เครื่องดื่ม', 1)
const snacksId = await categoryId('ขนม', 2)
const mealsId = await categoryId('อาหารจานเดียว', 3)

interface CatalogueEntry {
  sku: string
  name: string
  categoryId: number
  priceSatang: number
  costSatang: number
  trackStock: boolean
  groups: string[]
  /** How often it is ordered, relative to the others. */
  popularity: number
  /** Sold through table orders in the main branch. */
  dineIn: boolean
}
const catalogue: CatalogueEntry[] = [
  { sku: 'BEV-001', name: 'ชาไทยเย็น', categoryId: drinksId, priceSatang: 4500, costSatang: 1500, trackStock: false, groups: ['sweetness', 'toppings'], popularity: 14, dineIn: false },
  { sku: 'BEV-002', name: 'ชาเขียวนมเย็น', categoryId: drinksId, priceSatang: 5000, costSatang: 1800, trackStock: false, groups: ['sweetness', 'toppings'], popularity: 10, dineIn: false },
  { sku: 'BEV-003', name: 'กาแฟเย็น', categoryId: drinksId, priceSatang: 5500, costSatang: 1700, trackStock: false, groups: ['sweetness', 'toppings'], popularity: 16, dineIn: false },
  { sku: 'BEV-004', name: 'ลาเต้ร้อน', categoryId: drinksId, priceSatang: 6500, costSatang: 2000, trackStock: false, groups: ['sweetness'], popularity: 8, dineIn: false },
  { sku: 'BEV-005', name: 'โกโก้เย็น', categoryId: drinksId, priceSatang: 5000, costSatang: 1600, trackStock: false, groups: ['sweetness', 'toppings'], popularity: 7, dineIn: false },
  { sku: 'BEV-006', name: 'ชามะนาว', categoryId: drinksId, priceSatang: 4500, costSatang: 1200, trackStock: false, groups: ['sweetness'], popularity: 6, dineIn: false },
  { sku: 'MEL-001', name: 'ข้าวกะเพราหมูสับไข่ดาว', categoryId: mealsId, priceSatang: 6500, costSatang: 2800, trackStock: false, groups: ['extras'], popularity: 12, dineIn: true },
  { sku: 'MEL-002', name: 'ข้าวมันไก่', categoryId: mealsId, priceSatang: 6000, costSatang: 2500, trackStock: false, groups: ['extras'], popularity: 8, dineIn: true },
  { sku: 'MEL-003', name: 'ผัดไทยกุ้งสด', categoryId: mealsId, priceSatang: 8500, costSatang: 3800, trackStock: false, groups: [], popularity: 6, dineIn: true },
  { sku: 'MEL-004', name: 'สปาเกตตีคาโบนาร่า', categoryId: mealsId, priceSatang: 9500, costSatang: 4200, trackStock: false, groups: [], popularity: 4, dineIn: true },
  { sku: 'BKR-001', name: 'ครัวซองต์เนย', categoryId: snacksId, priceSatang: 6500, costSatang: 2600, trackStock: true, groups: [], popularity: 7, dineIn: false },
  { sku: 'BKR-002', name: 'บราวนี่', categoryId: snacksId, priceSatang: 5500, costSatang: 2000, trackStock: true, groups: [], popularity: 5, dineIn: false },
  { sku: 'BKR-003', name: 'เค้กช็อกโกแลตชิ้น', categoryId: snacksId, priceSatang: 8500, costSatang: 3500, trackStock: true, groups: [], popularity: 4, dineIn: false },
]
const existingProducts = await db.select().from(products)
for (const entry of catalogue) {
  if (existingProducts.some((row) => row.sku === entry.sku)) continue
  await db.insert(products).values({
    sku: entry.sku,
    name: entry.name,
    categoryId: entry.categoryId,
    priceSatang: entry.priceSatang,
    costSatang: entry.costSatang,
    trackStock: entry.trackStock,
  })
}
const productRows = await db.select().from(products)
const productBySku = new Map(productRows.map((row) => [row.sku, row]))

// The four products the plain seed made are sold too, at the till, and kept in stock.
const packaged = productRows
  .filter((row) => ['DRK-001', 'DRK-002', 'SNK-001', 'SNK-002'].includes(row.sku))
  .map<CatalogueEntry & { id: number }>((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    categoryId: row.categoryId ?? 0,
    priceSatang: row.priceSatang,
    costSatang: row.costSatang,
    trackStock: row.trackStock,
    groups: [],
    popularity: 5,
    dineIn: false,
  }))

interface OptionRow {
  id: number
  groupId: number
  groupName: string
  name: string
  priceSatang: number
  costSatang: number
}
interface GroupRow {
  id: number
  name: string
  required: boolean
  maxSelections: number
  options: OptionRow[]
}
const groupDefs: { key: string; name: string; required: boolean; maxSelections: number; options: [string, number, number][] }[] = [
  { key: 'sweetness', name: 'ระดับความหวาน', required: true, maxSelections: 1, options: [['หวานปกติ', 0, 0], ['หวานน้อย', 0, 0], ['ไม่หวาน', 0, 0], ['หวานมาก', 0, 0]] },
  { key: 'toppings', name: 'ท็อปปิง', required: false, maxSelections: 3, options: [['ไข่มุก', 1000, 400], ['วุ้นมะพร้าว', 800, 300], ['ครีมชีส', 1500, 700]] },
  { key: 'extras', name: 'เพิ่มเติม', required: false, maxSelections: 2, options: [['ไข่ดาว', 1000, 400], ['ข้าวเพิ่ม', 1000, 300]] },
]
const groups = new Map<string, GroupRow>()
for (const [index, def] of groupDefs.entries()) {
  const [group] = await db
    .insert(modifierGroups)
    .values({ name: def.name, required: def.required, maxSelections: def.maxSelections, sortOrder: index })
    .returning({ id: modifierGroups.id })
  const optionRows = await db
    .insert(modifierOptions)
    .values(def.options.map(([name, priceSatang, costSatang], order) => ({ groupId: group!.id, name, priceSatang, costSatang, sortOrder: order })))
    .returning({ id: modifierOptions.id })
  groups.set(def.key, {
    id: group!.id,
    name: def.name,
    required: def.required,
    maxSelections: def.maxSelections,
    options: def.options.map(([name, priceSatang, costSatang], order) => ({
      id: optionRows[order]!.id,
      groupId: group!.id,
      groupName: def.name,
      name,
      priceSatang,
      costSatang,
    })),
  })
}
const bindings = catalogue.flatMap((entry) =>
  entry.groups.map((key, order) => ({ productId: productBySku.get(entry.sku)!.id, groupId: groups.get(key)!.id, sortOrder: order })),
)
if (bindings.length > 0) await db.insert(productModifierGroups).values(bindings)

interface Sellable extends CatalogueEntry {
  id: number
}
const sellable: Sellable[] = [
  ...catalogue.map((entry) => ({ ...entry, id: productBySku.get(entry.sku)!.id })),
  ...packaged,
]
const tracked = sellable.filter((entry) => entry.trackStock)

// ---- Tables of the main branch ----
const tableDefs = [
  ['A1', 'ในร้าน', 2, 40, 60], ['A2', 'ในร้าน', 2, 200, 60], ['A3', 'ในร้าน', 4, 360, 60],
  ['B1', 'ในร้าน', 4, 40, 240], ['B2', 'ในร้าน', 4, 240, 240], ['B3', 'ในร้าน', 6, 440, 220],
  ['T1', 'ระเบียง', 4, 700, 80], ['T2', 'ระเบียง', 4, 700, 260],
] as const
const tableRows = await db
  .insert(diningTables)
  .values(
    tableDefs.map(([name, zone, seats, x, y], order) => ({
      branchId: mainBranch!.id,
      name,
      zone,
      seats,
      x,
      y,
      width: seats >= 6 ? 220 : seats === 4 ? 150 : 110,
      height: 100,
      sortOrder: order,
    })),
  )
  .returning({ id: diningTables.id, name: diningTables.name })

// ---- Stock the shelves ----
// The movements the plain seed wrote are moved back to the start of the history, so the ledger reads in order.
const historyStart = startOfToday - (DAYS - 1) * DAY
await db.update(stockMovements).set({ createdAt: new Date(at(historyStart, 7, 30)) }).where(eq(stockMovements.branchId, mainBranch!.id))

const stock = new Map<string, number>() // `${branchId}:${productId}` -> quantity
const stockKey = (branchId: number, productId: number) => `${branchId}:${productId}`
const existingStock = await db.select().from(branchStock)
for (const row of existingStock) stock.set(stockKey(row.branchId, row.productId), row.qty)

interface Movement {
  branchId: number
  productId: number
  type: 'receive' | 'sale' | 'void'
  quantity: number
  reference: string | null
  note: string | null
  userId: number
  time: number
}

interface DraftSale {
  time: number
  lines: { entry: Sellable; quantity: number; options: LineOption[] }[]
  discountSatang: number
  method: 'cash' | 'promptpay' | 'card'
  subtotalSatang: number
  vatSatang: number
  totalSatang: number
  tenderedSatang: number
  changeSatang: number
  voidedAt: number | null
  voidReason: string | null
  viaOrder: boolean
}

const popularityOf = (entry: Sellable) => entry.popularity
const payerNames = ['สมชาย', 'วรรณา', 'ธนากร', 'พิมพ์ใจ', 'อนุชา', 'กมลชนก', 'ประเสริฐ', 'ศิริพร']
const voidReasons = ['ลูกค้ายกเลิกรายการ', 'คิดเงินผิดรายการ', 'ออกบิลซ้ำ', 'ลูกค้าเปลี่ยนใจ']
const hourWeights = [[8, 6], [9, 8], [10, 5], [11, 6], [12, 12], [13, 11], [14, 6], [15, 5], [16, 5], [17, 8], [18, 9], [19, 6], [20, 3]] as const

function chooseOptions(entry: Sellable): LineOption[] {
  const chosen: LineOption[] = []
  for (const key of entry.groups) {
    const group = groups.get(key)!
    const options = group.options
    const take = (option: OptionRow) =>
      chosen.push({
        groupId: option.groupId,
        groupName: option.groupName,
        optionId: option.id,
        name: option.name,
        priceSatang: option.priceSatang,
        costSatang: option.costSatang,
      })
    if (group.required) take(weighted(options.map((option, index) => [option, index === 0 ? 5 : index === 1 ? 4 : 1] as const)))
    else if (chance(0.35)) {
      const first = pick(options)
      take(first)
      if (group.maxSelections > 1 && chance(0.2)) {
        const second = pick(options.filter((option) => option.id !== first.id))
        take(second)
      }
    }
  }
  return chosen
}

function draftSale(dineIn: boolean, time: number, withinOpenHours: boolean): DraftSale {
  const count = weighted([[1, 40], [2, 38], [3, 17], [4, 5]] as const)
  const pool = sellable.filter((entry) => (dineIn ? true : !entry.dineIn || chance(0.1)))
  const lines: DraftSale['lines'] = []
  for (let n = 0; n < count; n++) {
    const entry = weighted(pool.filter((candidate) => !lines.some((line) => line.entry.id === candidate.id)).map((candidate) => [candidate, popularityOf(candidate)] as const))
    lines.push({ entry, quantity: weighted([[1, 74], [2, 21], [3, 5]] as const), options: chooseOptions(entry) })
  }
  const subtotalSatang = lines.reduce(
    (sum, line) => sum + (line.entry.priceSatang + line.options.reduce((extra, option) => extra + option.priceSatang, 0)) * line.quantity,
    0,
  )
  const discountSatang = chance(0.08) ? Math.min(pick([500, 1000, 2000]), Math.floor(subtotalSatang / 2)) : 0
  const { vatSatang, totalSatang } = calculateTotals({ subtotalSatang, discountSatang, vatMode: 'inclusive', vatRateBp: 700 })
  const method = weighted([['cash', 55], ['promptpay', 38], ['card', 7]] as const)
  let tenderedSatang = totalSatang
  if (method === 'cash') {
    const note = weighted([[2000, 3], [5000, 3], [10000, 5], [50000, 4], [100000, 3]] as const)
    tenderedSatang = Math.ceil(totalSatang / note) * note
    if (tenderedSatang - totalSatang > 50000) tenderedSatang = Math.ceil(totalSatang / 10000) * 10000
  }
  return {
    time,
    lines,
    discountSatang,
    method,
    subtotalSatang,
    vatSatang,
    totalSatang,
    tenderedSatang,
    changeSatang: tenderedSatang - totalSatang,
    voidedAt: null,
    voidReason: null,
    viaOrder: withinOpenHours && dineIn,
  }
}

const sumOf = (values: number[]) => values.reduce((total, value) => total + value, 0)
let saleCounter = 0
let summary = { sales: 0, voided: 0, shifts: 0, orders: 0, movements: 0, qr: 0 }

// ---- Every day, every branch ----
for (let back = DAYS - 1; back >= 0; back--) {
  const dayStart = startOfToday - back * DAY
  const localDay = new Date(dayStart + BANGKOK)
  const weekend = [0, 6].includes(localDay.getUTCDay())
  const isToday = back === 0

  for (const branch of BRANCHES) {
    const team = cashiersOf.get(branch.id)!
    const cashier = team[(DAYS - back) % team.length]!
    const isMain = branch.id === mainBranch!.id
    const openedAt = Math.min(at(dayStart, 7, between(50, 59)), now - 10 * MINUTE)

    // Sales of the day, in order of time.
    const target = Math.max(4, branch.perDay + (weekend ? Math.round(branch.perDay * 0.5) : 0) + between(-3, 5))
    const times: number[] = []
    for (let n = 0; n < target; n++) {
      const [hour] = weighted(hourWeights.map((entry) => [entry, entry[1]] as const))
      const time = at(dayStart, hour, between(0, 59))
      if (time > openedAt + 5 * MINUTE && time < now - 3 * MINUTE) times.push(time)
    }
    times.sort((a, b) => a - b)

    const closeAt = at(dayStart, 21, between(0, 25))
    const drafts = times.map((time) => draftSale(isMain && chance(0.45), time, isMain))
    // A few voids, always shortly after the sale and before the drawer is counted.
    for (const draft of drafts) {
      if (!chance(0.025)) continue
      const voidedAt = draft.time + between(5, 50) * MINUTE
      if (voidedAt < Math.min(now - 2 * MINUTE, closeAt - 10 * MINUTE)) {
        draft.voidedAt = voidedAt
        draft.voidReason = pick(voidReasons)
      }
    }

    // Shift.
    const [shift] = await db
      .insert(shifts)
      .values({
        branchId: branch.id,
        registerId: registerOf.get(branch.id)!,
        status: 'open',
        openedAt: new Date(openedAt),
        openedById: cashier.id,
        openedByName: cashier.name,
        openingCashSatang: branch.openingCash,
        currency: 'THB',
        timeZone: 'Asia/Bangkok',
        createdAt: new Date(openedAt),
      })
      .returning({ id: shifts.id })
    summary.shifts++

    // Receipt numbers follow the order of the sales in the branch's day.
    const receiptNos = drafts.map((_, index) => `${branch.code}-${compact(dayStart)}-${String(index + 1).padStart(5, '0')}`)

    // Stock: top the tracked products up at opening, then follow every sale and void.
    const movements: Movement[] = []
    if (back === DAYS - 1 || back % 3 === 0) {
      for (const entry of tracked) {
        const level = stock.get(stockKey(branch.id, entry.id)) ?? 0
        if (level < 45) {
          const quantity = 100 - level
          movements.push({ branchId: branch.id, productId: entry.id, type: 'receive', quantity, reference: null, note: back === DAYS - 1 ? 'ยอดยกมา' : 'รับของเข้าร้าน', userId: owner.id, time: openedAt - 15 * MINUTE })
        }
      }
    }
    drafts.forEach((draft, index) => {
      for (const line of draft.lines) {
        if (!line.entry.trackStock) continue
        movements.push({ branchId: branch.id, productId: line.entry.id, type: 'sale', quantity: -line.quantity, reference: receiptNos[index]!, note: null, userId: cashier.id, time: draft.time })
        if (draft.voidedAt)
          movements.push({ branchId: branch.id, productId: line.entry.id, type: 'void', quantity: line.quantity, reference: receiptNos[index]!, note: null, userId: owner.id, time: draft.voidedAt })
      }
    })
    movements.sort((a, b) => a.time - b.time)
    const movementRows = movements.map((movement) => {
      const key = stockKey(movement.branchId, movement.productId)
      const balanceAfter = (stock.get(key) ?? 0) + movement.quantity
      stock.set(key, balanceAfter)
      return {
        branchId: movement.branchId,
        productId: movement.productId,
        type: movement.type,
        quantity: movement.quantity,
        balanceAfter,
        reference: movement.reference,
        note: movement.note,
        userId: movement.userId,
        createdAt: new Date(movement.time),
      }
    })
    if (movementRows.length > 0) await db.insert(stockMovements).values(movementRows)
    summary.movements += movementRows.length

    // Sales, their lines and payments.
    let saleIds: number[] = []
    if (drafts.length > 0) {
      const inserted = await db
        .insert(sales)
        .values(
          drafts.map((draft, index) => ({
            receiptNo: receiptNos[index]!,
            branchId: branch.id,
            shiftId: shift!.id,
            status: draft.voidedAt ? ('voided' as const) : ('completed' as const),
            subtotalSatang: draft.subtotalSatang,
            discountSatang: draft.discountSatang,
            totalSatang: draft.totalSatang,
            vatSatang: draft.vatSatang,
            vatMode: 'inclusive' as const,
            vatRateBp: 700,
            paidSatang: draft.tenderedSatang,
            changeSatang: draft.changeSatang,
            cashierId: cashier.id,
            cashierName: cashier.name,
            shopName: SHOP.shopName,
            shopTaxId: SHOP.taxId,
            branchName: branch.name,
            shopAddress: branch.address,
            shopPhone: branch.phone,
            voidedById: draft.voidedAt ? owner.id : null,
            voidedAt: draft.voidedAt ? new Date(draft.voidedAt) : null,
            voidReason: draft.voidReason,
            createdAt: new Date(draft.time),
          })),
        )
        .returning({ id: sales.id })
      saleIds = inserted.map((row) => row.id)
      saleCounter += saleIds.length
      summary.sales += saleIds.length
      summary.voided += drafts.filter((draft) => draft.voidedAt).length

      await db.insert(saleItems).values(
        drafts.flatMap((draft, index) =>
          draft.lines.map((line) => {
            const extraPrice = sumOf(line.options.map((option) => option.priceSatang))
            const unitPriceSatang = line.entry.priceSatang + extraPrice
            return {
              saleId: saleIds[index]!,
              productId: line.entry.id,
              productName: line.entry.name,
              sku: line.entry.sku,
              unitPriceSatang,
              unitCostSatang: line.entry.costSatang + sumOf(line.options.map((option) => option.costSatang)),
              quantity: line.quantity,
              lineTotalSatang: unitPriceSatang * line.quantity,
              options: line.options,
            }
          }),
        ),
      )
      await db.insert(payments).values(
        drafts.map((draft, index) => ({ saleId: saleIds[index]!, method: draft.method, amountSatang: draft.tenderedSatang })),
      )

      // Each PromptPay payment was confirmed by the bank, and points at its sale.
      const qrRows = drafts.flatMap((draft, index) =>
        draft.method === 'promptpay'
          ? [
              {
                branchId: branch.id,
                reference: `QR${dayLabel(dayStart).replaceAll('-', '')}${String(saleCounter - saleIds.length + index).padStart(6, '0')}${between(1000, 9999)}`,
                amountSatang: draft.totalSatang,
                status: 'paid' as const,
                qrRawData: '00020101021230670016A000000677010112011501055600123456102' + String(between(100000, 999999)),
                expiresAt: new Date(draft.time + 9 * MINUTE),
                bankTransactionId: `SCB${between(100000000, 999999999)}`,
                payerName: pick(payerNames),
                paidAt: new Date(draft.time - MINUTE),
                lastCheckedAt: new Date(draft.time - MINUTE),
                saleId: saleIds[index]!,
                originShiftId: shift!.id,
                createdById: cashier.id,
                createdAt: new Date(draft.time - 2 * MINUTE),
                updatedAt: new Date(draft.time - MINUTE),
              },
            ]
          : [],
      )
      if (qrRows.length > 0) {
        await db.insert(qrPayments).values(qrRows)
        summary.qr += qrRows.length
      }

      await db.insert(receiptCounters).values({ branchId: branch.id, day: dayLabel(dayStart), lastNumber: drafts.length })
    }

    // Drawer entries: cash sales (net of change), some float, some expenses, and refunds of voided cash sales.
    const entries: { kind: 'cash_sale' | 'cash_in' | 'cash_out' | 'cash_refund'; amountSatang: number; saleId: number | null; actorId: number; actorName: string; reason: string | null; time: number }[] = []
    drafts.forEach((draft, index) => {
      if (draft.method !== 'cash') return
      entries.push({ kind: 'cash_sale', amountSatang: draft.totalSatang, saleId: saleIds[index]!, actorId: cashier.id, actorName: cashier.name, reason: null, time: draft.time })
      if (draft.voidedAt && chance(0.8))
        entries.push({ kind: 'cash_refund', amountSatang: draft.totalSatang, saleId: saleIds[index]!, actorId: owner.id, actorName: owner.displayName, reason: draft.voidReason, time: draft.voidedAt + 2 * MINUTE })
    })
    if (!isToday || now > at(dayStart, 13, 30)) {
      if (chance(0.3)) entries.push({ kind: 'cash_in', amountSatang: 50_000, saleId: null, actorId: cashier.id, actorName: cashier.name, reason: 'เติมเงินทอน', time: at(dayStart, 13, between(0, 30)) })
      if (chance(0.4)) entries.push({ kind: 'cash_out', amountSatang: between(2, 6) * 10_000, saleId: null, actorId: cashier.id, actorName: cashier.name, reason: pick(['ซื้อน้ำแข็ง', 'ค่าส่งของ', 'ซื้อวัตถุดิบ']), time: at(dayStart, 15, between(0, 40)) })
    }
    entries.sort((a, b) => a.time - b.time)
    if (entries.length > 0)
      await db.insert(shiftCashEntries).values(
        entries.map((entry) => ({
          shiftId: shift!.id,
          kind: entry.kind,
          amountSatang: entry.amountSatang,
          saleId: entry.saleId,
          actorId: entry.actorId,
          actorName: entry.actorName,
          reason: entry.reason,
          createdAt: new Date(entry.time),
        })),
      )

    // Close the drawer of every past day. Today's shift stays open.
    if (!isToday) {
      const cash = {
        cashSaleSatang: sumOf(entries.filter((entry) => entry.kind === 'cash_sale').map((entry) => entry.amountSatang)),
        cashInSatang: sumOf(entries.filter((entry) => entry.kind === 'cash_in').map((entry) => entry.amountSatang)),
        cashOutSatang: sumOf(entries.filter((entry) => entry.kind === 'cash_out').map((entry) => entry.amountSatang)),
        cashRefundSatang: sumOf(entries.filter((entry) => entry.kind === 'cash_refund').map((entry) => entry.amountSatang)),
      }
      const voided = drafts.filter((draft) => draft.voidedAt)
      const tendered = (['cash', 'promptpay', 'card'] as const)
        .map((method) => ({ method, amountSatang: sumOf(drafts.filter((draft) => draft.method === method).map((draft) => draft.tenderedSatang)) }))
        .filter((entry) => entry.amountSatang > 0)
      const report = buildShiftSummary(
        branch.openingCash,
        {
          saleCount: drafts.length,
          grossSalesSatang: sumOf(drafts.map((draft) => draft.totalSatang)),
          voidedCount: voided.length,
          voidedSatang: sumOf(voided.map((draft) => draft.totalSatang)),
          changeSatang: sumOf(drafts.map((draft) => draft.changeSatang)),
          tendered,
        },
        cash,
      )
      const difference = weighted([[0, 78], [-2000, 8], [-500, 6], [1000, 5], [500, 3]] as const)
      const countingAt = closeAt - 6 * MINUTE
      await db
        .update(shifts)
        .set({
          status: 'closed',
          closingRevision: 1,
          closingStartedAt: new Date(countingAt),
          closingStartedById: cashier.id,
          closingStartedByName: cashier.name,
          closingExpectedCashSatang: report.expectedCashSatang,
          closedAt: new Date(closeAt),
          closedById: cashier.id,
          closedByName: cashier.name,
          countedCashSatang: report.expectedCashSatang + difference,
          cashDifferenceSatang: difference,
          differenceReason: difference === 0 ? null : difference < 0 ? 'ทอนเงินผิด' : 'นับเศษเหรียญคลาดเคลื่อน',
        })
        .where(eq(shifts.id, shift!.id))
      await db.insert(shiftSummaries).values({ shiftId: shift!.id, summary: report, capturedAt: new Date(countingAt) })
    }

    // Orders: the table sales went through an order first, paid with the sale.
    if (isMain) {
      const viaOrder = drafts.map((draft, index) => ({ draft, index })).filter((entry) => entry.draft.viaOrder)
      if (viaOrder.length > 0) {
        const orderRows = await db
          .insert(orders)
          .values(
            viaOrder.map(({ draft, index }) => ({
              branchId: branch.id,
              tableId: tableRows[(index + back) % tableRows.length]!.id,
              status: 'paid' as const,
              openedById: cashier.id,
              openedByName: cashier.name,
              saleId: saleIds[index]!,
              createdAt: new Date(draft.time - between(8, 40) * MINUTE),
              updatedAt: new Date(draft.time),
            })),
          )
          .returning({ id: orders.id })
        await db.insert(orderItems).values(
          viaOrder.flatMap(({ draft }, position) =>
            draft.lines.map((line) => ({
              orderId: orderRows[position]!.id,
              productId: line.entry.id,
              productName: line.entry.name,
              sku: line.entry.sku,
              unitPriceSatang: line.entry.priceSatang + sumOf(line.options.map((option) => option.priceSatang)),
              quantity: line.quantity,
              options: line.options,
              optionsKey: lineKey(line.options),
            })),
          ),
        )
        summary.orders += orderRows.length
      }
    }
  }
}

// ---- What is happening right now at the tables of the main branch ----
const tableId = (name: string) => tableRows.find((row) => row.name === name)!.id
const todayShift = (await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.status, 'open'))).length
const nowCashier = cashiersOf.get(mainBranch!.id)![0]!
const liveOrder = (table: string, minutesAgo: number, items: { sku: string; quantity: number; options?: LineOption[] }[], extra: Partial<typeof orders.$inferInsert> = {}) => ({
  header: {
    branchId: mainBranch!.id,
    tableId: tableId(table),
    openedById: nowCashier.id,
    openedByName: nowCashier.name,
    createdAt: new Date(now - minutesAgo * MINUTE),
    updatedAt: new Date(now - Math.max(1, minutesAgo - 3) * MINUTE),
    ...extra,
  },
  items: items.map((item) => {
    const row = productBySku.get(item.sku)!
    const options = item.options ?? []
    return {
      productId: row.id,
      productName: row.name,
      sku: row.sku,
      unitPriceSatang: row.priceSatang + sumOf(options.map((option) => option.priceSatang)),
      quantity: item.quantity,
      options,
      optionsKey: lineKey(options),
    }
  }),
})
const optionOf = (groupKey: string, name: string): LineOption => {
  const option = groups.get(groupKey)!.options.find((candidate) => candidate.name === name)!
  return { groupId: option.groupId, groupName: option.groupName, optionId: option.id, name: option.name, priceSatang: option.priceSatang, costSatang: option.costSatang }
}
const live = [
  liveOrder('A3', 35, [{ sku: 'MEL-001', quantity: 2, options: [optionOf('extras', 'ไข่ดาว')] }, { sku: 'BEV-003', quantity: 2, options: [optionOf('sweetness', 'หวานน้อย')] }]),
  liveOrder('B2', 22, [{ sku: 'MEL-003', quantity: 1 }, { sku: 'BEV-006', quantity: 1, options: [optionOf('sweetness', 'หวานปกติ')] }]),
  liveOrder('T1', 12, [{ sku: 'BKR-003', quantity: 2 }, { sku: 'BEV-001', quantity: 2, options: [optionOf('sweetness', 'หวานปกติ'), optionOf('toppings', 'ไข่มุก')] }]),
  liveOrder('T1', 9, [{ sku: 'MEL-002', quantity: 1 }]),
]
const liveRows = await db.insert(orders).values(live.map((order) => order.header)).returning({ id: orders.id })
await db.insert(orderItems).values(live.flatMap((order, position) => order.items.map((item) => ({ ...item, orderId: liveRows[position]!.id }))))
// One order folded into another, and one the customer walked away from.
await db.insert(orders).values([
  { ...liveOrder('T1', 20, []).header, status: 'merged' as const, mergedIntoId: liveRows[2]!.id },
  {
    ...liveOrder('A1', 50, []).header,
    status: 'cancelled' as const,
    cancelReason: 'ลูกค้าเปลี่ยนใจ',
    cancelledById: nowCashier.id,
    updatedAt: new Date(now - 45 * MINUTE),
  },
])

// ---- Final stock and the marker that the shop works in shifts ----
const finalStock = [...stock.entries()].map(([key, qty]) => {
  const [branchId, productId] = key.split(':').map(Number) as [number, number]
  return { branchId, productId, qty }
})
await db
  .insert(branchStock)
  .values(finalStock)
  .onConflictDoUpdate({ target: [branchStock.branchId, branchStock.productId], set: { qty: sql`excluded.qty` } })
await db
  .insert(checkoutModeState)
  .values({ id: 1, shiftsActivatedAt: new Date(startOfToday - (DAYS - 1) * DAY + 8 * HOUR) })
  .onConflictDoNothing()

console.log(
  `Demo data added: ${summary.sales} sales (${summary.voided} voided) in ${summary.shifts} shifts, ` +
    `${summary.orders} paid table orders + ${live.length} open, ${summary.movements} stock movements, ${summary.qr} QR payments`,
)
console.log(`Open shifts: ${todayShift}. Cashiers somying, wichai (MAIN) and mali (SIAM) all use the password: ${password}`)

  // End of the transaction: either all of the demo data is written, or none of it.
})

await client.close()
