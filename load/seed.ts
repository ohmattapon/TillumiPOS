// The bulk data a load run starts from: products, members, promotions, staff, registers and a year of past bills.
//
// Everything is drawn from one seeded generator and dated from a fixed reference day, so the same options give the
// same rows on every run. Rows are generated here with the server's own pricing and allocation rules
// (calculateTotals, evaluatePromotion, allocateBillToLines) and written in large set-based inserts
// (json_to_recordset), because 100,000 bills through the API would take far too long.
//
// It expects a database that already has the migrations and the base seed (the MAIN branch, the system roles and
// an owner). It writes in one transaction, so a failure leaves nothing behind.
import type { SQL } from 'bun'
import { allocateBillToLines } from '../server/src/domains/bill-allocation'
import { calculateTotals } from '../server/src/domains/pricing'
import { evaluatePromotion, PromotionEntity, type PromotionProps } from '../server/src/domains/promotion.domain'
import { randomTools, type RandomTools } from './lib/prng'
import { assertLoadDatabaseName } from './lib/safety'

export interface SeedOptions {
  products?: number
  categories?: number
  members?: number
  promotions?: number
  pastSales?: number
  cashiers?: number
  registers?: number
  /** Password of every seeded cashier, made by the runner at run time. Required. */
  cashierPassword?: string
  /** PIN for quick staff switching (4 to 6 digits) given to every seeded cashier; none when left out. */
  cashierPin?: string
  /** The day the history ends before (Bangkok midnight). Past bills fill the 365 days before it. */
  referenceDate?: Date
  /** Seed of the random generator. */
  seed?: number
}

export interface SeededData {
  /** Seeded products with ample stock (or none tracked), safe to sell without options. Excludes hotProductIds. */
  productIds: number[]
  /** 5 tracked products with 1 to 20 in stock, for contention. They have no history, packs or options. */
  hotProductIds: number[]
  memberIds: number[]
  cashierUsernames: string[]
  /** Extra cashiers reserved for the auth scenario (lockouts), never used for selling. */
  authUsers: string[]
  registerIds: number[]
  couponCodes: string[]
}

export const SEED_DEFAULTS = { products: 2000, categories: 30, members: 5000, promotions: 20, pastSales: 100_000, cashiers: 20, registers: 10 }
/** A fixed day so the default history is the same on every run; the runner may pass its own. */
export const DEFAULT_REFERENCE_DATE = new Date('2026-10-01T00:00:00+07:00')
export const DEFAULT_SEED = 20261030

const AUTH_USERS = 10
const HOT_PRODUCTS = 5
const HISTORY_DAYS = 365
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const BANGKOK = 7 * HOUR
const VAT_MODE = 'inclusive' as const
const VAT_RATE_BP = 700
const TIME_ZONE = 'Asia/Bangkok'
const CHUNK = 10_000

type Tx = Pick<SQL, 'unsafe'>

const pad = (value: number, width: number) => String(value).padStart(width, '0')
const dayLabel = (at: number) => new Date(at + BANGKOK).toISOString().slice(0, 10)
const iso = (at: number) => new Date(at).toISOString()

/**
 * Inserts rows through one json_to_recordset statement per chunk. `columns` maps each column to its SQL type and
 * every row carries those keys; `select` may replace the plain column list (to join another table, for example).
 */
async function insertRows(tx: Tx, table: string, columns: Record<string, string>, rows: object[], options: { select?: string; from?: string; returning?: string } = {}) {
  const names = Object.keys(columns)
  const definition = names.map((name) => `${name} ${columns[name]}`).join(', ')
  const returned: Record<string, unknown>[] = []
  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK)
    const target = options.select ? options.select : `(${names.join(', ')}) select ${names.map((name) => `x.${name}`).join(', ')}`
    const query = `insert into ${table} ${target} from json_to_recordset($1::text::json) as x(${definition}) ${options.from ?? ''} ${options.returning ? `returning ${options.returning}` : ''}`
    returned.push(...(await tx.unsafe(query, [JSON.stringify(chunk)])))
  }
  return returned
}

const NOUNS = ['น้ำดื่ม', 'กาแฟ', 'ชาเขียว', 'ขนมปัง', 'บะหมี่', 'ข้าวสาร', 'น้ำปลา', 'สบู่', 'ยาสีฟัน', 'ผงซักฟอก', 'นมสด', 'โยเกิร์ต', 'ไข่ไก่', 'น้ำมันพืช', 'ซอสปรุงรส', 'มันฝรั่งทอด', 'ลูกอม', 'ช็อกโกแลต', 'น้ำผลไม้', 'กระดาษทิชชู']
const VARIANTS = ['ขนาดเล็ก', 'ขนาดกลาง', 'ขนาดใหญ่', 'แพ็กประหยัด', 'สูตรดั้งเดิม', 'สูตรใหม่', 'รสเผ็ด', 'รสหวาน']
const VOID_REASONS = ['ลูกค้ายกเลิกรายการ', 'คิดเงินผิดรายการ', 'ออกบิลซ้ำ']

interface SeedProduct {
  index: number
  id: number
  sku: string
  name: string
  categoryId: number
  priceSatang: number
  costSatang: number
  trackStock: boolean
  hot: boolean
  packSize: number | null
}

interface Context {
  random: RandomTools
  branch: { id: number; code: string }
  ownerId: number
  shopName: string
  historyStart: number
}

async function readBase(tx: Tx) {
  const [branch] = await tx.unsafe(`select id, code from branches where code = 'MAIN'`)
  const [owner] = await tx.unsafe(`select id from users where role = 'owner' and is_active order by id limit 1`)
  const [cashierRole] = await tx.unsafe(`select id from roles where system_key = 'cashier'`)
  if (!branch || !owner || !cashierRole) throw new Error('Run the migrations and the base seed first: the MAIN branch, an owner or the cashier role is missing')
  // Points are on so the members scenario can redeem; history is priced with the VAT the bills record.
  const [settings] = await tx.unsafe(
    `insert into shop_settings (id, shop_name, currency, vat_mode, vat_rate_bp, time_zone, locale, points_enabled)
     values (1, 'TillumiPOS', 'THB', '${VAT_MODE}', ${VAT_RATE_BP}, '${TIME_ZONE}', 'th', true)
     on conflict (id) do update set points_enabled = true returning shop_name`,
  )
  return { branch: { id: branch.id as number, code: branch.code as string }, ownerId: owner.id as number, cashierRoleId: cashierRole.id as number, shopName: settings.shop_name as string }
}

async function seedCategories(tx: Tx, count: number, at: number): Promise<number[]> {
  const rows = Array.from({ length: count }, (_, index) => ({ name: `หมวดโหลด ${pad(index + 1, 2)}`, sort_order: 100 + index, created_at: iso(at), updated_at: iso(at) }))
  const inserted = await insertRows(tx, 'categories', { name: 'text', sort_order: 'int', created_at: 'timestamptz', updated_at: 'timestamptz' }, rows, { returning: 'id, name' })
  const idOf = new Map(inserted.map((row) => [row.name as string, row.id as number]))
  return rows.map((row) => idOf.get(row.name)!)
}

async function seedProducts(tx: Tx, ctx: Context, count: number, categoryIds: number[]): Promise<SeedProduct[]> {
  const { random } = ctx
  let hotLeft = HOT_PRODUCTS
  const drafts = Array.from({ length: count }, (_, index) => {
    const priceSatang = random.between(10, 600) * 100
    const trackStock = index % 10 !== 0
    const packable = trackStock && index % 8 === 3
    const hot = trackStock && !packable && hotLeft > 0
    if (hot) hotLeft--
    return {
      index,
      sku: `LD-${pad(index + 1, 5)}`,
      barcode: `29${pad(index + 1, 11)}`,
      name: `${random.pick(NOUNS)} ${random.pick(VARIANTS)} ${index + 1}`,
      categoryId: categoryIds[random.between(0, categoryIds.length - 1)]!,
      priceSatang,
      costSatang: Math.round((priceSatang * random.between(55, 80)) / 100),
      trackStock,
      hot,
      packSize: packable ? random.pick([6, 12, 24]) : null,
    }
  })
  const at = iso(ctx.historyStart - DAY)
  const inserted = await insertRows(
    tx,
    'products',
    { sku: 'text', barcode: 'text', name: 'text', category_id: 'int', price_satang: 'int', cost_satang: 'int', track_stock: 'boolean', created_at: 'timestamptz', updated_at: 'timestamptz' },
    drafts.map((draft) => ({ sku: draft.sku, barcode: draft.barcode, name: draft.name, category_id: draft.categoryId, price_satang: draft.priceSatang, cost_satang: draft.costSatang, track_stock: draft.trackStock, created_at: at, updated_at: at })),
    { returning: 'id, sku' },
  )
  const idOf = new Map(inserted.map((row) => [row.sku as string, row.id as number]))
  const products = drafts.map((draft) => ({ ...draft, id: idOf.get(draft.sku)! }))

  // A pack sells at size x price, or a little under it on every other pack.
  const packs = products
    .filter((product) => product.packSize !== null)
    .map((product, order) => ({
      product_id: product.id,
      barcode: `28${pad(product.index + 1, 11)}`,
      size: product.packSize,
      price_satang: order % 2 === 0 ? null : Math.round((product.packSize! * product.priceSatang * 0.95) / 100) * 100,
      created_at: at,
      updated_at: at,
    }))
  await insertRows(tx, 'product_packs', { product_id: 'int', barcode: 'text', size: 'int', price_satang: 'int', created_at: 'timestamptz', updated_at: 'timestamptz' }, packs)
  return products
}

/** Two optional groups on the untracked products, so the catalog has options to read but a plain sale still works. */
async function seedModifiers(tx: Tx, products: SeedProduct[]) {
  const groups: [string, number, [string, number, number][]][] = [
    ['ระดับความหวาน (โหลด)', 1, [['หวานปกติ', 0, 0], ['หวานน้อย', 0, 0], ['ไม่หวาน', 0, 0]]],
    ['ท็อปปิง (โหลด)', 3, [['ไข่มุก', 1000, 400], ['วุ้นมะพร้าว', 800, 300], ['ครีมชีส', 1500, 700]]],
  ]
  const offered = products.filter((product) => !product.trackStock)
  for (const [order, [name, maxSelections, options]] of groups.entries()) {
    const [group] = await tx.unsafe(`insert into modifier_groups (name, required, max_selections, sort_order) values ($1, false, $2, $3) returning id`, [name, maxSelections, order])
    await insertRows(
      tx,
      'modifier_options',
      { group_id: 'int', name: 'text', price_satang: 'int', cost_satang: 'int', sort_order: 'int' },
      options.map(([option, price, cost], sort) => ({ group_id: group.id, name: option, price_satang: price, cost_satang: cost, sort_order: sort })),
    )
    await insertRows(tx, 'product_modifier_groups', { product_id: 'int', group_id: 'int', sort_order: 'int' }, offered.map((product) => ({ product_id: product.id, group_id: group.id, sort_order: order })))
  }
}

interface SeedMember {
  id: number
  name: string
}

async function seedMembers(tx: Tx, ctx: Context, count: number): Promise<SeedMember[]> {
  const at = iso(ctx.historyStart - DAY)
  const rows = Array.from({ length: count }, (_, index) => ({
    name: `สมาชิกโหลด ${index + 1}`,
    phone: `08${pad(index + 1, 8)}`,
    points_balance: ctx.random.chance(0.7) ? ctx.random.between(1, 800) : 0,
    created_at: at,
    updated_at: at,
  }))
  const inserted = await insertRows(tx, 'members', { name: 'text', phone: 'text', points_balance: 'int', created_at: 'timestamptz', updated_at: 'timestamptz' }, rows, { returning: 'id, phone' })
  const idOf = new Map(inserted.map((row) => [row.phone as string, row.id as number]))
  // The balance moves only through the ledger, so the opening balance is one adjustment per member.
  const members = rows.map((row) => ({ id: idOf.get(row.phone)!, name: row.name, points: row.points_balance }))
  await insertRows(
    tx,
    'member_point_movements',
    { member_id: 'int', kind: 'point_movement_kind', points: 'int', reason: 'text', created_by_id: 'int', created_at: 'timestamptz' },
    members.filter((member) => member.points > 0).map((member) => ({ member_id: member.id, kind: 'adjust', points: member.points, reason: 'ยอดยกมา', created_by_id: ctx.ownerId, created_at: at })),
  )
  return members
}

type PromotionDraft = Omit<PromotionProps, 'id' | 'createdAt' | 'updatedAt'>

/** Every kind the shop can set up, cycling: percent, fixed, bundle, coupon, and a limited one. */
function promotionDraft(index: number, categoryIds: number[]): PromotionDraft {
  const base: PromotionDraft = {
    name: `โปรโหลด ${pad(index + 1, 2)}`,
    kind: 'percent',
    value: 500,
    maxDiscountSatang: null,
    minSubtotalSatang: 0,
    startsOn: null,
    endsOn: null,
    weekdays: null,
    windowStartMinute: null,
    windowEndMinute: null,
    audience: 'everyone',
    isActive: true,
    scope: null,
    couponCode: null,
    buyQuantity: null,
    freeQuantity: null,
    maxUses: null,
    maxUsesPerMember: null,
    imageKey: null,
  }
  switch (index % 5) {
    case 0: {
      // Basis points, so the name is derived from the same value the rules read: 1000 = 10%.
      const value = ((index % 3) + 1) * 1_000
      return { ...base, name: `${base.name} ลด ${value / 100}%`, value, maxDiscountSatang: 20_000 }
    }
    case 1:
      return { ...base, name: `${base.name} ลดตรง`, kind: 'fixed', value: 2_000 + (index % 4) * 1_000, minSubtotalSatang: 30_000 }
    case 2:
      return { ...base, name: `${base.name} ซื้อ 2 แถม 1`, kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, scope: { productIds: [], categoryIds: [categoryIds[index % categoryIds.length]!] } }
    case 3:
      return { ...base, name: `${base.name} คูปอง`, value: 1_000, maxDiscountSatang: 30_000, couponCode: `LOAD${pad(index + 1, 2)}` }
    default:
      // Alternating: a small shop-wide cap that contention can exhaust, and a per-member cap.
      return index % 10 === 4
        ? { ...base, name: `${base.name} จำกัดจำนวน`, value: 700, maxUses: 50 }
        : { ...base, name: `${base.name} สมาชิกจำกัดครั้ง`, value: 800, audience: 'members', maxUses: null, maxUsesPerMember: 3 }
  }
}

async function seedPromotions(tx: Tx, ctx: Context, count: number, categoryIds: number[]): Promise<PromotionEntity[]> {
  const at = new Date(ctx.historyStart - DAY)
  const promotions: PromotionEntity[] = []
  for (let index = 0; index < count; index++) {
    const draft = promotionDraft(index, categoryIds)
    // The entity checks the same rules the API would, before anything is written.
    const checked = new PromotionEntity({ ...draft, id: 1, createdAt: at, updatedAt: at })
    const [row] = await tx.unsafe(
      `insert into promotions (name, kind, value, max_discount_satang, min_subtotal_satang, audience, coupon_code, buy_quantity, free_quantity, max_uses, max_uses_per_member, product_ids, category_ids, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::int[], $13::int[], $14, $14) returning id`,
      [
        checked.name, checked.kind, checked.value, checked.maxDiscountSatang, checked.minSubtotalSatang, checked.audience, checked.couponCode,
        checked.buyQuantity, checked.freeQuantity, checked.maxUses, checked.maxUsesPerMember,
        checked.scope ? `{${checked.scope.productIds.join(',')}}` : null, checked.scope ? `{${checked.scope.categoryIds.join(',')}}` : null, at.toISOString(),
      ],
    )
    promotions.push(new PromotionEntity({ ...draft, id: row.id, createdAt: at, updatedAt: at }))
  }
  return promotions
}

interface SeedCashier {
  id: number
  name: string
}

async function seedUsers(tx: Tx, ctx: Context, cashierRoleId: number, count: number, passwordHash: string, pinHash: string | null) {
  const at = iso(ctx.historyStart - DAY)
  const cashiers = Array.from({ length: count }, (_, index) => ({ username: `cashier${pad(index + 1, 2)}`, display_name: `แคชเชียร์ ${pad(index + 1, 2)}` }))
  const probes = Array.from({ length: AUTH_USERS }, (_, index) => ({ username: `lockprobe${index + 1}`, display_name: `ทดสอบล็อก ${index + 1}` }))
  const inserted = await insertRows(
    tx,
    'users',
    { username: 'text', display_name: 'text', password_hash: 'text', pin_hash: 'text', role: 'user_role', role_id: 'int', branch_id: 'int', created_at: 'timestamptz', updated_at: 'timestamptz' },
    [...cashiers, ...probes].map((user) => ({ ...user, password_hash: passwordHash, pin_hash: pinHash, role: 'cashier', role_id: cashierRoleId, branch_id: ctx.branch.id, created_at: at, updated_at: at })),
    { returning: 'id, username' },
  )
  const idOf = new Map(inserted.map((row) => [row.username as string, row.id as number]))
  return {
    cashiers: cashiers.map((user) => ({ id: idOf.get(user.username)!, name: user.display_name })),
    cashierUsernames: cashiers.map((user) => user.username),
    authUsers: probes.map((user) => user.username),
  }
}

async function seedRegisters(tx: Tx, ctx: Context, count: number): Promise<number[]> {
  const rows = Array.from({ length: count }, (_, index) => ({ branch_id: ctx.branch.id, code: `LOAD${pad(index + 1, 2)}`, name: `เครื่องคิดเงินโหลด ${pad(index + 1, 2)}` }))
  const inserted = await insertRows(tx, 'registers', { branch_id: 'int', code: 'text', name: 'text' }, rows, { returning: 'id, code' })
  const idOf = new Map(inserted.map((row) => [row.code as string, row.id as number]))
  return rows.map((row) => idOf.get(row.code)!)
}

interface Movement {
  productId: number
  type: 'receive' | 'sale' | 'void'
  quantity: number
  reference: string | null
  note: string | null
  userId: number
  time: number
}

/** Draws one bill: lines, an optional member and promotion or typed discount, totals, payment and a rare void. */
function draftSale(ctx: Context, time: number, pool: SeedProduct[], members: SeedMember[], promotions: PromotionEntity[], cashiers: SeedCashier[]) {
  const { random } = ctx
  const count = Math.min(random.weighted([[1, 40], [2, 35], [3, 17], [4, 8]] as const), pool.length)
  const lines: { product: SeedProduct; quantity: number }[] = []
  while (lines.length < count) {
    // Squaring the roll favours the first products, so some sell far more than others, as in a real shop.
    const product = pool[Math.floor(random.next() ** 2 * pool.length)]!
    if (lines.some((line) => line.product.id === product.id)) continue
    lines.push({ product, quantity: random.weighted([[1, 74], [2, 21], [3, 5]] as const) })
  }
  const lineTotals = lines.map((line) => line.product.priceSatang * line.quantity)
  const subtotalSatang = lineTotals.reduce((sum, total) => sum + total, 0)
  const member = members.length > 0 && random.chance(0.2) ? random.pick(members) : null

  let discountSatang = 0
  let promotion: { id: number; snapshot: object } | null = null
  if (promotions.length > 0 && random.chance(0.1)) {
    const chosen = random.pick(promotions)
    const result = evaluatePromotion(chosen, {
      subtotalSatang,
      hasMember: member !== null,
      at: new Date(time),
      timeZone: TIME_ZONE,
      lines: lines.map((line, index) => ({ productId: line.product.id, categoryId: line.product.categoryId, unitPriceSatang: line.product.priceSatang, quantity: line.quantity, isPack: false, lineTotalSatang: lineTotals[index]! })),
      couponCode: null,
    })
    if (result.eligible) {
      discountSatang = result.discountSatang
      promotion = { id: chosen.id, snapshot: { id: chosen.id, name: chosen.name, kind: chosen.kind, value: chosen.value, maxDiscountSatang: chosen.maxDiscountSatang, discountSatang } }
    }
  } else if (random.chance(0.03)) discountSatang = Math.min(random.pick([500, 1000, 2000]), Math.floor(subtotalSatang / 2))

  const { vatSatang, totalSatang } = calculateTotals({ subtotalSatang, discountSatang, vatMode: VAT_MODE, vatRateBp: VAT_RATE_BP })
  const method = random.weighted([['cash', 55], ['promptpay', 38], ['card', 7]] as const)
  let paidSatang = totalSatang
  if (method === 'cash') {
    const note = random.weighted([[2000, 3], [5000, 3], [10000, 5], [50000, 4], [100000, 3]] as const)
    paidSatang = Math.ceil(totalSatang / note) * note
    if (paidSatang - totalSatang > 50000) paidSatang = Math.ceil(totalSatang / 10000) * 10000
  }
  const voidedAt = random.chance(0.01) ? time + random.between(5, 50) * MINUTE : null
  return {
    time,
    lines,
    shares: allocateBillToLines({ totalSatang, vatSatang }, lineTotals),
    subtotalSatang,
    discountSatang,
    vatSatang,
    totalSatang,
    method,
    paidSatang,
    changeSatang: paidSatang - totalSatang,
    member,
    promotion,
    cashier: random.pick(cashiers),
    voidedAt,
    voidReason: voidedAt === null ? null : random.pick(VOID_REASONS),
  }
}

type DraftSale = ReturnType<typeof draftSale>

async function seedHistory(tx: Tx, ctx: Context, count: number, products: SeedProduct[], members: SeedMember[], promotions: PromotionEntity[], cashiers: SeedCashier[]) {
  const { random, branch } = ctx
  const pool = products.filter((product) => !product.hot)
  // Only whole-bill promotions with no limit are given to past bills, so no limit is used up before the run.
  const usable = promotions.filter((promotion) => promotion.kind === 'percent' && promotion.scope === null && promotion.couponCode === null && promotion.audience === 'everyone' && promotion.maxUses === null)
  const sales: (DraftSale & { receiptNo: string })[] = []
  const counters: { branch_id: number; day: string; last_number: number }[] = []

  for (let day = 0; day < HISTORY_DAYS; day++) {
    const dayStart = ctx.historyStart + day * DAY
    const perDay = Math.floor(((day + 1) * count) / HISTORY_DAYS) - Math.floor((day * count) / HISTORY_DAYS)
    if (perDay === 0) continue
    // Open from 08:00 to 21:00, Bangkok time; receipt numbers follow the order of the day.
    const times = Array.from({ length: perDay }, () => dayStart + 8 * HOUR + random.between(0, 13 * 60 * 60 - 1) * 1000).sort((a, b) => a - b)
    const label = dayLabel(dayStart)
    times.forEach((time, index) => {
      sales.push({ ...draftSale(ctx, time, pool, members, usable, cashiers), receiptNo: `${branch.code}-${label.replaceAll('-', '')}-${pad(index + 1, 5)}` })
    })
    counters.push({ branch_id: branch.id, day: label, last_number: perDay })
  }

  await insertRows(
    tx,
    'sales',
    {
      receipt_no: 'text', branch_id: 'int', status: 'sale_status', subtotal_satang: 'int', discount_satang: 'int', total_satang: 'int', vat_satang: 'int', vat_mode: 'vat_mode', vat_rate_bp: 'int',
      paid_satang: 'int', change_satang: 'int', member_id: 'int', member: 'jsonb', promotion_id: 'int', promotion: 'jsonb', cashier_id: 'int', cashier_name: 'text', shop_name: 'text',
      voided_by_id: 'int', voided_at: 'timestamptz', void_reason: 'text', created_at: 'timestamptz',
    },
    sales.map((sale) => ({
      receipt_no: sale.receiptNo,
      branch_id: branch.id,
      status: sale.voidedAt === null ? 'completed' : 'voided',
      subtotal_satang: sale.subtotalSatang,
      discount_satang: sale.discountSatang,
      total_satang: sale.totalSatang,
      vat_satang: sale.vatSatang,
      vat_mode: VAT_MODE,
      vat_rate_bp: VAT_RATE_BP,
      paid_satang: sale.paidSatang,
      change_satang: sale.changeSatang,
      member_id: sale.member?.id ?? null,
      member: sale.member ? { id: sale.member.id, code: `M${pad(sale.member.id, 6)}`, name: sale.member.name } : null,
      promotion_id: sale.promotion?.id ?? null,
      promotion: sale.promotion?.snapshot ?? null,
      cashier_id: sale.cashier.id,
      cashier_name: sale.cashier.name,
      shop_name: ctx.shopName,
      voided_by_id: sale.voidedAt === null ? null : ctx.ownerId,
      voided_at: sale.voidedAt === null ? null : iso(sale.voidedAt),
      void_reason: sale.voidReason,
      created_at: iso(sale.time),
    })),
  )

  const itemColumns = { receipt_no: 'text', product_id: 'int', product_name: 'text', sku: 'text', unit_price_satang: 'int', unit_cost_satang: 'int', quantity: 'int', line_total_satang: 'int', category_id: 'int', allocated_total_satang: 'int', allocated_vat_satang: 'int' }
  const itemNames = Object.keys(itemColumns).filter((name) => name !== 'receipt_no')
  await insertRows(
    tx,
    'sale_items',
    itemColumns,
    sales.flatMap((sale) =>
      sale.lines.map((line, index) => ({
        receipt_no: sale.receiptNo,
        product_id: line.product.id,
        product_name: line.product.name,
        sku: line.product.sku,
        unit_price_satang: line.product.priceSatang,
        unit_cost_satang: line.product.costSatang,
        quantity: line.quantity,
        line_total_satang: line.product.priceSatang * line.quantity,
        category_id: line.product.categoryId,
        allocated_total_satang: sale.shares[index]!.totalSatang,
        allocated_vat_satang: sale.shares[index]!.vatSatang,
      })),
    ),
    { select: `(sale_id, ${itemNames.join(', ')}) select s.id, ${itemNames.map((name) => `x.${name}`).join(', ')}`, from: 'join sales s on s.receipt_no = x.receipt_no' },
  )
  await insertRows(
    tx,
    'payments',
    { receipt_no: 'text', method: 'payment_method', amount_satang: 'int' },
    sales.map((sale) => ({ receipt_no: sale.receiptNo, method: sale.method, amount_satang: sale.paidSatang })),
    { select: '(sale_id, method, amount_satang) select s.id, x.method, x.amount_satang', from: 'join sales s on s.receipt_no = x.receipt_no' },
  )
  // The counters carry on from the history, so a live sale on one of these days never repeats a receipt number.
  await insertRows(tx, 'receipt_counters', { branch_id: 'int', day: 'date', last_number: 'int' }, counters)

  const movements: Movement[] = []
  for (const sale of sales) {
    for (const line of sale.lines) {
      if (!line.product.trackStock) continue
      movements.push({ productId: line.product.id, type: 'sale', quantity: -line.quantity, reference: sale.receiptNo, note: null, userId: sale.cashier.id, time: sale.time })
      if (sale.voidedAt !== null) movements.push({ productId: line.product.id, type: 'void', quantity: line.quantity, reference: sale.receiptNo, note: null, userId: ctx.ownerId, time: sale.voidedAt })
    }
  }
  return movements
}

/** Opening stock and the ledger: one receipt per tracked product before the history, then every sale and void. */
async function seedStock(tx: Tx, ctx: Context, products: SeedProduct[], history: Movement[]) {
  const tracked = products.filter((product) => product.trackStock)
  const finalQty = new Map(tracked.map((product) => [product.id, product.hot ? ctx.random.between(1, 20) : ctx.random.between(500, 3000)]))
  const netSold = new Map<number, number>()
  for (const movement of history) netSold.set(movement.productId, (netSold.get(movement.productId) ?? 0) - movement.quantity)

  const opening: Movement[] = tracked.map((product) => ({
    productId: product.id,
    type: 'receive',
    quantity: finalQty.get(product.id)! + (netSold.get(product.id) ?? 0),
    reference: null,
    note: 'ยอดยกมา',
    userId: ctx.ownerId,
    time: ctx.historyStart - HOUR,
  }))
  // Sorted by time (stable), so ids follow time and each balance is the running sum of that product's ledger.
  const ordered = [...opening, ...history].sort((a, b) => a.time - b.time)
  const balance = new Map<number, number>()
  await insertRows(
    tx,
    'stock_movements',
    { branch_id: 'int', product_id: 'int', type: 'stock_movement_type', quantity: 'int', balance_after: 'int', reference: 'text', note: 'text', user_id: 'int', created_at: 'timestamptz' },
    ordered.map((movement) => {
      const after = (balance.get(movement.productId) ?? 0) + movement.quantity
      balance.set(movement.productId, after)
      return { branch_id: ctx.branch.id, product_id: movement.productId, type: movement.type, quantity: movement.quantity, balance_after: after, reference: movement.reference, note: movement.note, user_id: movement.userId, created_at: iso(movement.time) }
    }),
  )
  await insertRows(tx, 'branch_stock', { branch_id: 'int', product_id: 'int', qty: 'int' }, tracked.map((product) => ({ branch_id: ctx.branch.id, product_id: product.id, qty: finalQty.get(product.id)! })))
}

/** Bangkok midnight of the day `at` falls on. */
function bangkokMidnight(at: Date): number {
  return Math.floor((at.getTime() + BANGKOK) / DAY) * DAY - BANGKOK
}

export async function seedLoadData(sql: SQL, options: SeedOptions = {}): Promise<SeededData> {
  const sizes = { ...SEED_DEFAULTS, ...Object.fromEntries(Object.entries(options).filter(([key, value]) => key in SEED_DEFAULTS && value !== undefined)) } as typeof SEED_DEFAULTS
  // Defence in depth: whoever built the handle, bulk data only ever goes into a throwaway pos_load* database.
  const [connected] = await sql.unsafe('select current_database() as name')
  assertLoadDatabaseName(String(connected?.name ?? ''))
  if (!options.cashierPassword) throw new Error('seedLoadData needs options.cashierPassword: the runner makes one at run time')
  if (options.cashierPin !== undefined && !/^\d{4,6}$/.test(options.cashierPin)) throw new Error('options.cashierPin must be 4 to 6 digits')
  if (sizes.categories < 1 || sizes.cashiers < 1 || sizes.products < HOT_PRODUCTS + 2) throw new Error(`Seed at least 1 category, 1 cashier and ${HOT_PRODUCTS + 2} products`)

  // Hashed once, outside the transaction: every seeded cashier shares the password and the PIN.
  const passwordHash = await Bun.password.hash(options.cashierPassword)
  const pinHash = options.cashierPin === undefined ? null : await Bun.password.hash(options.cashierPin)
  const historyStart = bangkokMidnight(options.referenceDate ?? DEFAULT_REFERENCE_DATE) - HISTORY_DAYS * DAY

  const seeded = await sql.begin(async (tx) => {
    const base = await readBase(tx)
    const ctx: Context = { random: randomTools(options.seed ?? DEFAULT_SEED), branch: base.branch, ownerId: base.ownerId, shopName: base.shopName, historyStart }
    const categoryIds = await seedCategories(tx, sizes.categories, historyStart - DAY)
    const products = await seedProducts(tx, ctx, sizes.products, categoryIds)
    await seedModifiers(tx, products)
    const members = await seedMembers(tx, ctx, sizes.members)
    const promotions = await seedPromotions(tx, ctx, sizes.promotions, categoryIds)
    const users = await seedUsers(tx, ctx, base.cashierRoleId, sizes.cashiers, passwordHash, pinHash)
    const registerIds = await seedRegisters(tx, ctx, sizes.registers)
    const history = await seedHistory(tx, ctx, sizes.pastSales, products, members, promotions, users.cashiers)
    await seedStock(tx, ctx, products, history)
    return {
      productIds: products.filter((product) => !product.hot).map((product) => product.id),
      hotProductIds: products.filter((product) => product.hot).map((product) => product.id),
      memberIds: members.map((member) => member.id),
      cashierUsernames: users.cashierUsernames,
      authUsers: users.authUsers,
      registerIds,
      couponCodes: promotions.flatMap((promotion) => (promotion.couponCode === null ? [] : [promotion.couponCode])),
    }
  })
  // Fresh statistics, so the first queries of the run are planned for the real row counts.
  await sql.unsafe('analyze')
  return seeded
}
