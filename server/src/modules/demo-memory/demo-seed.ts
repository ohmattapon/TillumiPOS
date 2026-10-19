import type { DependencyContainer } from 'tsyringe'
import { buildAuditEntry } from '../../domains/audit-entry.vo'
import { BranchEntity } from '../../domains/branch.domain'
import { CategoryEntity } from '../../domains/category.domain'
import { DiningTableEntity } from '../../domains/dining-table.domain'
import { DomainConflictError } from '../../domains/errors/domain-conflict.error'
import { ModifierGroupEntity, ModifierOptionEntity, type LineOption } from '../../domains/modifier.domain'
import { OrderEntity } from '../../domains/order.domain'
import { PERMISSIONS } from '../../domains/permission.vo'
import { calculateTotals } from '../../domains/pricing'
import { ProductEntity } from '../../domains/product.domain'
import { RegisterEntity } from '../../domains/register.domain'
import { RoleEntity } from '../../domains/role.domain'
import { SaleEntity, type PaymentMethod } from '../../domains/sale.domain'
import { ShiftCashEntryEntity } from '../../domains/shift-cash-entry.domain'
import { ShiftEntity } from '../../domains/shift.domain'
import { buildShiftSummary, type ShiftCashTotals, type ShiftSalesTotals } from '../../domains/shift-summary'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../domains/shop-settings.domain'
import { UserEntity } from '../../domains/user.domain'
import { auditLogToken, type IAuditLog } from '../audit/applications/ports/audit-log.port'
import { branchRepositoryToken, type IBranchRepository } from '../branches/applications/ports/branch.repository'
import { categoryRepositoryToken, type ICategoryRepository } from '../categories/applications/ports/category.repository'
import { stockLedgerToken, type IStockLedger } from '../inventory/applications/ports/stock-ledger.port'
import { modifierRepositoryToken, type IModifierRepository } from '../modifiers/applications/ports/modifier.repository'
import { orderRepositoryToken, type IOrderRepository } from '../orders/applications/ports/order.repository'
import { productRepositoryToken, type IProductRepository } from '../products/applications/ports/product.repository'
import { roleRepositoryToken, type IRoleRepository } from '../roles/applications/ports/role.repository'
import { saleRepositoryToken, type ISaleRepository } from '../sales/applications/ports/sale.repository'
import { registerRepositoryToken, type IRegisterRepository } from '../shifts/applications/ports/register.repository'
import { shiftRepositoryToken, type IShiftRepository } from '../shifts/applications/ports/shift.repository'
import { shiftSummaryRepositoryToken, type IShiftSummaryRepository } from '../shifts/applications/ports/shift-summary.repository'
import { shopSettingsRepositoryToken, type IShopSettingsRepository } from '../settings/applications/ports/shop-settings.repository'
import type { IPasswordHasher } from '../shared/ports/password-hasher.port'
import { tableRepositoryToken, type ITableRepository } from '../tables/applications/ports/table.repository'
import { userRepositoryToken, type IUserRepository } from '../users/applications/ports/user.repository'
import { TOKENS } from '../tokens'
import { MemoryClock } from './memory/memory-clock'

export interface DemoSeedSummary {
  users: number
  categories: number
  products: number
  sales: number
  voided: number
  shifts: number
  orders: number
}

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 24 * HOUR
const BANGKOK_OFFSET = 7 * HOUR
/** Today plus 20 days back: three weeks of history, like db:seed:demo. */
const HISTORY_DAYS = 21
const OPENING_CASH_SATANG = 100_000

const SHOP = {
  shopName: 'ร้านกาแฟบ้านสวน',
  taxId: '0105560012345',
  address: '99/9 ซอยสุขุมวิท 39 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',
  phone: '02-123-4567',
  receiptFooter: 'ขอบคุณที่ใช้บริการ · ติดตามโปรโมชันที่ไลน์ @bansuan',
  branchName: 'สาขาสุขุมวิท 39',
  // The shop's own PromptPay identifier for static QR. Bank QR stays
  // unavailable in demo: no SCB values are configured, by design.
  promptpayTarget: '0891234567',
} as const

// Fixed demo credentials. docs/demo-mode.md (Task 5) must list them; they must
// never appear in the production seed, migrations or environment files.
const OWNER = { username: 'admin', password: 'demo-owner-1234', displayName: 'เจ้าของร้าน', pin: '1234' } as const
const CASHIERS = [
  { username: 'somying', password: 'demo-cashier-1234', displayName: 'สมหญิง ใจดี', pin: '1111' },
  { username: 'wichai', password: 'demo-cashier-1234', displayName: 'วิชัย รักงาน', pin: '2222' },
] as const

// Repeatable randomness, so every boot grows the same demo. db:seed:demo uses
// the same technique against the database; this copy stays local because that
// script cannot be imported (it runs on import).
const mulberry32 = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface DemoCatalogRow {
  code: string
  product_name: string | null
  product_name_th: string | null
  brands: string | null
  quantity: string | null
  categories_tags_en: string[] | null
}

// The same ten buckets seed-demo-product-catalog.ts files the JSON rows into.
const CATEGORY_NAMES = [
  'เครื่องดื่ม',
  'ขนม',
  'นมและผลิตภัณฑ์',
  'อาหารแห้ง',
  'อาหารกระป๋อง',
  'ซอสและเครื่องปรุง',
  'เบเกอรี่',
  'อาหารแช่แข็ง',
  'อาหารเด็ก',
  'สินค้าอื่นๆ',
] as const
type DemoCategory = (typeof CATEGORY_NAMES)[number]

const categoryFor = (product: DemoCatalogRow): DemoCategory => {
  const tags = (product.categories_tags_en ?? []).join(' ').toLowerCase()
  if (/beverage|drink|water|coffee|tea|juice|soda/.test(tags)) return 'เครื่องดื่ม'
  if (/dairy|milk|cheese|yogurt|yoghurt|butter/.test(tags)) return 'นมและผลิตภัณฑ์'
  if (/snack|chips|crisp|cracker|biscuit|cookie|chocolate|candy|confection/.test(tags)) return 'ขนม'
  if (/canned|tinned|preserved/.test(tags)) return 'อาหารกระป๋อง'
  if (/sauce|condiment|seasoning|spice|oil/.test(tags)) return 'ซอสและเครื่องปรุง'
  if (/bread|bakery|pastr|cake|bun/.test(tags)) return 'เบเกอรี่'
  if (/frozen|ice-cream/.test(tags)) return 'อาหารแช่แข็ง'
  if (/baby|infant/.test(tags)) return 'อาหารเด็ก'
  if (/pasta|noodle|rice|cereal|flour|legume|pulse/.test(tags)) return 'อาหารแห้ง'
  return 'สินค้าอื่นๆ'
}

const stableNumber = (value: string): number => {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return hash >>> 0
}

const demoProductName = (product: DemoCatalogRow): string => {
  const name = product.product_name_th?.trim() || product.product_name?.trim() || 'สินค้า'
  const brand = product.brands?.split(',')[0]?.trim()
  const hasBrand = brand && name.toLocaleLowerCase().includes(brand.toLocaleLowerCase())
  const quantity = product.quantity?.trim()
  const value = [brand && !hasBrand ? brand : null, name, quantity].filter(Boolean).join(' ')
  return Array.from(value).slice(0, 200).join('')
}

const demoPrices = (product: DemoCatalogRow, category: DemoCategory): { priceSatang: number; costSatang: number } => {
  const ranges: Record<DemoCategory, [number, number]> = {
    เครื่องดื่ม: [5, 150],
    ขนม: [5, 180],
    'นมและผลิตภัณฑ์': [10, 220],
    อาหารแห้ง: [8, 250],
    อาหารกระป๋อง: [15, 250],
    'ซอสและเครื่องปรุง': [10, 280],
    เบเกอรี่: [10, 200],
    อาหารแช่แข็ง: [15, 300],
    อาหารเด็ก: [15, 350],
    'สินค้าอื่นๆ': [8, 250],
  }
  const [min, max] = ranges[category]
  const priceSatang = (min + (stableNumber(product.code) % (max - min + 1))) * 100
  return { priceSatang, costSatang: Math.floor(priceSatang * 0.72) }
}

/**
 * Fills the memory repositories with the demo dataset: shop, branch, register,
 * owner + cashiers (fixed credentials above), the JSON product catalog with
 * stock, modifier groups for drinks, tables, three weeks of sales, closed and
 * open shifts, open table orders and one voided sale with its audit trail.
 *
 * Entities are constructed directly (faster than use cases; constructors still
 * validate, so the data stays legal). Timestamps flow through a pinned
 * MemoryClock, never through wall-clock calls here. The one branch is MAIN
 * with id 1, and the owner `admin` gets id 1, because both are created first.
 *
 * Throws when users already exist, so double-seeding is loud instead of
 * silently duplicating. Task 5 owns calling this at boot, before requests.
 */
export async function seedDemoMemory(container: DependencyContainer): Promise<DemoSeedSummary> {
  // Clock first: every memory repository below stamps through IClock, so they
  // must all capture this instance. Nothing else may bind TOKENS.Clock.
  const clock = new MemoryClock()
  container.register(TOKENS.Clock, { useValue: clock })

  const settings = container.resolve<IShopSettingsRepository>(shopSettingsRepositoryToken)
  const branches = container.resolve<IBranchRepository>(branchRepositoryToken)
  const registers = container.resolve<IRegisterRepository>(registerRepositoryToken)
  const roles = container.resolve<IRoleRepository>(roleRepositoryToken)
  const users = container.resolve<IUserRepository>(userRepositoryToken)
  const hasher = container.resolve<IPasswordHasher>(TOKENS.PasswordHasher)
  const categories = container.resolve<ICategoryRepository>(categoryRepositoryToken)
  const products = container.resolve<IProductRepository>(productRepositoryToken)
  const modifiers = container.resolve<IModifierRepository>(modifierRepositoryToken)
  const ledger = container.resolve<IStockLedger>(stockLedgerToken)
  const tables = container.resolve<ITableRepository>(tableRepositoryToken)
  const sales = container.resolve<ISaleRepository>(saleRepositoryToken)
  const shifts = container.resolve<IShiftRepository>(shiftRepositoryToken)
  const summaries = container.resolve<IShiftSummaryRepository>(shiftSummaryRepositoryToken)
  const orders = container.resolve<IOrderRepository>(orderRepositoryToken)
  const audit = container.resolve<IAuditLog>(auditLogToken)

  if ((await users.findAll()).length > 0)
    throw new DomainConflictError('โหมดสาธิตมีข้อมูลอยู่แล้ว ไม่เติมข้อมูลซ้ำ', 'DEMO_ALREADY_SEEDED')

  const bootMs = clock.now().getTime()
  const startOfTodayMs = Math.floor((bootMs + BANGKOK_OFFSET) / DAY) * DAY - BANGKOK_OFFSET
  const at = (dayStartMs: number, hour: number, minute = 0): number => dayStartMs + hour * HOUR + minute * MINUTE

  try {
    await settings.save(
      new ShopSettingsEntity({
        ...DEFAULT_SHOP_SETTINGS,
        shopName: SHOP.shopName,
        taxId: SHOP.taxId,
        address: SHOP.address,
        phone: SHOP.phone,
        receiptFooter: SHOP.receiptFooter,
        // Static QR: staff confirm the money, the bank is never called.
        promptpayMode: 'static',
        promptpayTarget: SHOP.promptpayTarget,
      }),
    )

    const branch = await branches.create(
      new BranchEntity({ id: 0, code: 'MAIN', name: SHOP.branchName, address: SHOP.address, phone: SHOP.phone, isActive: true }),
    )
    const register = await registers.create(
      new RegisterEntity({ id: 0, branchId: branch.id, code: 'POS1', name: 'เคาน์เตอร์หลัก', isActive: true }),
    )

    const ownerRole = await roles.create(
      new RoleEntity({ id: 0, name: 'เจ้าของร้าน', systemKey: 'owner', permissions: [...PERMISSIONS] }),
    )
    // Selling needs no permission (ordinary selling is auth:true);
    // reports.read lets the demo cashiers open the report screens.
    const cashierRole = await roles.create(
      new RoleEntity({ id: 0, name: 'แคชเชียร์', systemKey: 'cashier', permissions: ['reports.read'] }),
    )

    const owner = await users.create(
      new UserEntity({ id: 0, username: OWNER.username, displayName: OWNER.displayName, role: 'owner', roleId: ownerRole.id, branchId: branch.id, isActive: true }),
      await hasher.hash(OWNER.password),
    )
    await users.setPinHash(owner.id, await hasher.hash(OWNER.pin))
    await audit.record({ id: null, name: 'โหมดสาธิต' }, branch.id, buildAuditEntry({
      action: 'user.create',
      entityType: 'user',
      entityId: String(owner.id),
      summary: 'สร้างผู้ใช้',
      after: { displayName: owner.displayName, roleId: owner.roleId, branchId: owner.branchId, isActive: owner.isActive },
    }))

    const cashierUsers: UserEntity[] = []
    for (const plan of CASHIERS) {
      const created = await users.create(
        new UserEntity({ id: 0, username: plan.username, displayName: plan.displayName, role: 'cashier', roleId: cashierRole.id, branchId: branch.id, isActive: true }),
        await hasher.hash(plan.password),
      )
      await users.setPinHash(created.id, await hasher.hash(plan.pin))
      cashierUsers.push(created)
      await audit.record({ id: owner.id, name: owner.displayName }, branch.id, buildAuditEntry({
        action: 'user.create',
        entityType: 'user',
        entityId: String(created.id),
        summary: 'สร้างผู้ใช้',
        after: { displayName: created.displayName, roleId: created.roleId, branchId: created.branchId, isActive: created.isActive },
      }))
    }

    // The catalog file itself, never a copy: rows map to products deterministically.
    const manifest = (await Bun.file(
      new URL('../../infrastructure/database/demo-product-catalog.json', import.meta.url),
    ).json()) as DemoCatalogRow[]
    const categoryIds = new Map<string, number>()
    for (const [index, name] of CATEGORY_NAMES.entries())
      categoryIds.set(
        name,
        (await categories.create(new CategoryEntity({ id: 0, name, sortOrder: (index + 1) * 10, isActive: true }))).id,
      )
    const drinksId = categoryIds.get('เครื่องดื่ม')!

    const seenBarcodes = new Set<string>()
    const catalog: ProductEntity[] = []
    for (const source of manifest) {
      if (!source.code) continue
      const category = categoryFor(source)
      const { priceSatang, costSatang } = demoPrices(source, category)
      const barcode = !seenBarcodes.has(source.code) ? source.code : null
      if (barcode) seenBarcodes.add(barcode)
      // MEDIA_STORAGE=none in demo, so imageKey stays null: no photos, by design.
      catalog.push(
        await products.create(
          new ProductEntity({
            id: 0,
            sku: `OFF-${source.code}`,
            barcode,
            name: demoProductName(source),
            categoryId: categoryIds.get(category)!,
            productType: 'normal',
            priceSatang,
            costSatang,
            trackStock: true,
            stockQty: 0,
            isActive: true,
            imageKey: null,
          }),
          branch.id,
        ),
      )
    }

    const sweetness = await modifiers.createGroup(
      new ModifierGroupEntity({ id: 0, name: 'ระดับความหวาน', required: true, maxSelections: 1, sortOrder: 0, isActive: true }),
    )
    const toppings = await modifiers.createGroup(
      new ModifierGroupEntity({ id: 0, name: 'ท็อปปิง', required: false, maxSelections: 3, sortOrder: 1, isActive: true }),
    )
    const sweetnessOptions: ModifierOptionEntity[] = []
    for (const [index, name] of ['หวานปกติ', 'หวานน้อย', 'ไม่หวาน', 'หวานมาก'].entries())
      sweetnessOptions.push(
        await modifiers.createOption(
          new ModifierOptionEntity({ id: 0, groupId: sweetness.id, name, priceSatang: 0, costSatang: 0, sortOrder: index, isActive: true, isDefault: index === 0 }),
        ),
      )
    const toppingOptions: ModifierOptionEntity[] = []
    const toppingDefs = [['ไข่มุก', 1000, 400], ['วุ้นมะพร้าว', 800, 300], ['ครีมชีส', 1500, 700]] as const
    for (const [index, [name, priceSatang, costSatang]] of toppingDefs.entries())
      toppingOptions.push(
        await modifiers.createOption(
          new ModifierOptionEntity({ id: 0, groupId: toppings.id, name, priceSatang, costSatang, sortOrder: index, isActive: true, isDefault: false }),
        ),
      )
    for (const product of catalog)
      if (product.categoryId === drinksId) await modifiers.setProductGroups(product.id, [sweetness.id, toppings.id])

    const historyStartMs = startOfTodayMs - (HISTORY_DAYS - 1) * DAY
    clock.freezeMs(at(historyStartMs, 7, 30))
    for (const product of catalog)
      await ledger.record({
        branchId: branch.id,
        productId: product.id,
        type: 'receive',
        quantity: 10 + (stableNumber(product.sku) % 41),
        note: 'ยอดยกมา',
        userId: owner.id,
      })

    const tableDefs = [
      ['A1', 'ในร้าน', 2, 40, 60], ['A2', 'ในร้าน', 2, 200, 60], ['A3', 'ในร้าน', 4, 360, 60],
      ['B1', 'ในร้าน', 4, 40, 240], ['B2', 'ในร้าน', 4, 240, 240], ['B3', 'ในร้าน', 6, 440, 220],
      ['T1', 'ระเบียง', 4, 700, 80], ['T2', 'ระเบียง', 4, 700, 260],
    ] as const
    const tableByName = new Map<string, number>()
    for (const [index, [name, zone, seats, x, y]] of tableDefs.entries()) {
      const created = await tables.create(
        new DiningTableEntity({
          id: 0, branchId: branch.id, name, zone, seats, x, y,
          width: seats >= 6 ? 220 : seats === 4 ? 150 : 110,
          height: 100, sortOrder: index, isActive: true,
        }),
      )
      tableByName.set(name, created.id)
    }

    const openShift = async (dayStartMs: number, openedBy: UserEntity): Promise<ShiftEntity> => {
      clock.freezeMs(at(dayStartMs, 7, 55))
      return shifts.create(
        new ShiftEntity({
          id: 0, branchId: branch.id, registerId: register.id, status: 'open',
          openedAt: clock.now(), openedById: openedBy.id, openedByName: openedBy.displayName,
          openingCashSatang: OPENING_CASH_SATANG, openingNote: null, currency: 'THB', timeZone: 'Asia/Bangkok',
          closingRevision: 0, closingStartedAt: null, closingStartedById: null, closingStartedByName: null,
          closingExpectedCashSatang: null, closedAt: null, closedById: null, closedByName: null,
          countedCashSatang: null, cashDifferenceSatang: null, differenceReason: null,
        }),
      )
    }
    const todayShift = await openShift(startOfTodayMs, cashierUsers[0]!)
    const pastShifts = new Map<number, ShiftEntity>()
    for (const back of [2, 1]) pastShifts.set(back, await openShift(startOfTodayMs - back * DAY, cashierUsers[back % cashierUsers.length]!))

    const random = mulberry32(20261019)
    const randomOf = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
    const shiftSales = new Map<number, SaleEntity[]>()
    shiftSales.set(todayShift.id, [])
    for (const shell of pastShifts.values()) shiftSales.set(shell.id, [])
    let todayFirstSale: SaleEntity | null = null

    // Oldest first, so receipt numbers ascend within each business day.
    for (let back = HISTORY_DAYS - 1; back >= 0; back--) {
      const dayStartMs = startOfTodayMs - back * DAY
      const count = back === 0 ? 3 : back <= 2 ? 2 : 1
      for (let n = 0; n < count; n++) {
        const time = at(dayStartMs, 9 + Math.floor(random() * 10), Math.floor(random() * 60))
        const cashier = cashierUsers[(back + n) % cashierUsers.length]!
        const shiftId = back === 0 ? todayShift.id : back <= 2 ? pastShifts.get(back)!.id : null

        const lineCount = 1 + (random() < 0.45 ? 1 : 0) + (random() < 0.15 ? 1 : 0)
        const used = new Set<number>()
        const lines: { product: ProductEntity; quantity: number; options: LineOption[] }[] = []
        for (let l = 0; l < lineCount; l++) {
          let product = randomOf(catalog)
          for (let guard = 0; guard < 10 && used.has(product.id); guard++) product = randomOf(catalog)
          used.add(product.id)
          const options: LineOption[] = []
          if (product.categoryId === drinksId) {
            const sweet = randomOf(sweetnessOptions)
            options.push({ groupId: sweetness.id, groupName: sweetness.name, optionId: sweet.id, name: sweet.name, priceSatang: sweet.priceSatang, costSatang: sweet.costSatang })
            if (random() < 0.35) {
              const top = randomOf(toppingOptions)
              options.push({ groupId: toppings.id, groupName: toppings.name, optionId: top.id, name: top.name, priceSatang: top.priceSatang, costSatang: top.costSatang })
            }
          }
          lines.push({ product, quantity: 1 + (random() < 0.25 ? 1 : 0), options })
        }
        const subtotalEstimate = lines.reduce(
          (sum, line) => sum + (line.product.priceSatang + line.options.reduce((extra, option) => extra + option.priceSatang, 0)) * line.quantity,
          0,
        )
        const discountSatang = random() < 0.08
          ? Math.min(randomOf([500, 1000, 2000]), Math.floor(subtotalEstimate / 2))
          : 0
        const roll = random()
        const method: PaymentMethod = roll < 0.55 ? 'cash' : roll < 0.93 ? 'promptpay' : 'card'
        const { totalSatang } = calculateTotals({ subtotalSatang: subtotalEstimate, discountSatang, vatMode: 'inclusive', vatRateBp: 700 })
        let tenderedSatang = totalSatang
        if (method === 'cash') {
          const note = randomOf([2000, 5000, 10000, 50000, 100000])
          tenderedSatang = Math.ceil(totalSatang / note) * note
          if (tenderedSatang - totalSatang > 50000) tenderedSatang = Math.ceil(totalSatang / 10000) * 10000
        }
        const draft = SaleEntity.complete({
          lines,
          discountSatang,
          payments: [{ method, amountSatang: tenderedSatang }],
          vatMode: 'inclusive',
          vatRateBp: 700,
          branchId: branch.id,
          shiftId,
          cashier: { id: cashier.id, displayName: cashier.displayName },
          seller: {
            shopName: SHOP.shopName, shopTaxId: SHOP.taxId, branchName: branch.name,
            shopAddress: branch.address, shopPhone: branch.phone,
          },
        })

        clock.freezeMs(time)
        const receiptNo = await sales.nextReceiptNo({ id: branch.id, code: branch.code })
        const created = await sales.create(draft, receiptNo)
        for (const item of created.items)
          await ledger.record({ branchId: branch.id, productId: item.productId, type: 'sale', quantity: -item.quantity, reference: receiptNo, userId: cashier.id })
        if (method === 'cash' && shiftId !== null)
          await shifts.addCashEntry(
            new ShiftCashEntryEntity({
              id: 0, shiftId, kind: 'cash_sale', amountSatang: created.totalSatang, saleId: created.id,
              actorId: cashier.id, actorName: cashier.displayName, reason: null, createdAt: clock.now(),
            }),
          )
        if (shiftId !== null) shiftSales.get(shiftId)!.push(created)
        if (back === 0 && n === 0) todayFirstSale = created
      }
    }

    // One voided sale for the audit trail, before its shift is closed so the
    // frozen summary counts it — mirroring VoidSaleUseCase step by step.
    const voidedDay = pastShifts.get(1)!
    const voidCandidates = shiftSales.get(voidedDay.id) ?? []
    const toVoid = voidCandidates.find((sale) => sale.payments[0]?.method === 'cash') ?? voidCandidates[0]!
    const voidReason = 'คิดเงินผิดรายการ'
    clock.freezeMs(toVoid.createdAt.getTime() + 35 * MINUTE)
    const voided = toVoid.void(voidReason, owner.id, clock.now())
    await sales.saveVoid(voided)
    shiftSales.set(voidedDay.id, voidCandidates.map((sale) => (sale.id === voided.id ? voided : sale)))
    for (const item of [...voided.items].sort((a, b) => a.productId - b.productId))
      await ledger.record({ branchId: branch.id, productId: item.productId, type: 'void', quantity: item.quantity, reference: voided.receiptNo, note: voidReason, userId: owner.id })
    if (toVoid.payments[0]?.method === 'cash') {
      await shifts.addCashEntry(
        new ShiftCashEntryEntity({
          id: 0, shiftId: voidedDay.id, kind: 'cash_refund', amountSatang: toVoid.totalSatang, saleId: toVoid.id,
          actorId: owner.id, actorName: owner.displayName, reason: voidReason, createdAt: clock.now(),
        }),
      )
      await audit.record({ id: owner.id, name: owner.displayName }, branch.id, buildAuditEntry({
        action: 'sale.cash_refund',
        entityType: 'sale',
        entityId: String(toVoid.id),
        summary: 'คืนเงินสด',
        after: { amountSatang: toVoid.totalSatang, shiftId: voidedDay.id },
        reason: voidReason,
      }))
    }
    await audit.record({ id: owner.id, name: owner.displayName }, branch.id, buildAuditEntry({
      action: 'sale.void',
      entityType: 'sale',
      entityId: String(toVoid.id),
      summary: 'ยกเลิกบิลขาย',
      before: { status: 'completed' },
      after: { status: 'voided' },
      reason: voidReason,
    }))

    // Close the past shifts: float and expenses first, then the frozen report.
    for (const back of [2, 1]) {
      const shell = pastShifts.get(back)!
      const dayStartMs = startOfTodayMs - back * DAY
      const cashier = cashierUsers[back % cashierUsers.length]!
      clock.freezeMs(at(dayStartMs, 13, 15))
      await shifts.addCashEntry(
        new ShiftCashEntryEntity({
          id: 0, shiftId: shell.id, kind: 'cash_in', amountSatang: 50000, saleId: null,
          actorId: cashier.id, actorName: cashier.displayName, reason: 'เติมเงินทอน', createdAt: clock.now(),
        }),
      )
      clock.freezeMs(at(dayStartMs, 15, 20))
      await shifts.addCashEntry(
        new ShiftCashEntryEntity({
          id: 0, shiftId: shell.id, kind: 'cash_out', amountSatang: 30000, saleId: null,
          actorId: cashier.id, actorName: cashier.displayName, reason: 'ซื้อน้ำแข็ง', createdAt: clock.now(),
        }),
      )
      const recorded = shiftSales.get(shell.id) ?? []
      const voidedRows = recorded.filter((sale) => sale.status === 'voided')
      const tendered = new Map<PaymentMethod, number>()
      for (const sale of recorded)
        for (const payment of sale.payments)
          tendered.set(payment.method, (tendered.get(payment.method) ?? 0) + payment.amountSatang)
      const salesTotals: ShiftSalesTotals = {
        saleCount: recorded.length,
        grossSalesSatang: recorded.reduce((total, sale) => total + sale.totalSatang, 0),
        voidedCount: voidedRows.length,
        voidedSatang: voidedRows.reduce((total, sale) => total + sale.totalSatang, 0),
        changeSatang: recorded.reduce((total, sale) => total + sale.changeSatang, 0),
        tendered: (['card', 'cash', 'promptpay'] as const)
          .filter((method) => tendered.has(method))
          .map((method) => ({ method, amountSatang: tendered.get(method)! })),
      }
      const cashTotals: ShiftCashTotals = {
        cashSaleSatang: 0,
        cashInSatang: 50000,
        cashOutSatang: 30000,
        cashRefundSatang: 0,
      }
      for (const sale of recorded)
        if (sale.payments[0]?.method === 'cash') cashTotals.cashSaleSatang += sale.totalSatang
      if (toVoid.shiftId === shell.id && toVoid.payments[0]?.method === 'cash') cashTotals.cashRefundSatang = toVoid.totalSatang
      const summary = buildShiftSummary(OPENING_CASH_SATANG, salesTotals, cashTotals)
      clock.freezeMs(at(dayStartMs, 20, 54))
      const capturedAt = clock.now()
      await summaries.freeze(shell.id, summary, capturedAt)
      const difference = back === 1 ? 0 : -500
      clock.freezeMs(at(dayStartMs, 21, 5))
      await shifts.update(
        new ShiftEntity({
          ...shell.toSnapshot(),
          status: 'closed',
          closingRevision: 1,
          closingStartedAt: capturedAt,
          closingStartedById: cashier.id,
          closingStartedByName: cashier.displayName,
          closingExpectedCashSatang: summary.expectedCashSatang,
          closedAt: clock.now(),
          closedById: cashier.id,
          closedByName: cashier.displayName,
          countedCashSatang: summary.expectedCashSatang + difference,
          cashDifferenceSatang: difference,
          differenceReason: difference === 0 ? null : 'ทอนเงินผิด',
        }),
      )
    }

    // What is happening right now on the floor: open orders on tables.
    const drinks = catalog.filter((product) => product.categoryId === drinksId)
    const snacks = catalog.filter((product) => product.categoryId !== drinksId)
    const drinkOf = (index: number): ProductEntity => drinks[index % drinks.length]!
    const snackOf = (index: number): ProductEntity => snacks[index % snacks.length]!
    const sweetLine = (product: ProductEntity, quantity: number) => {
      const sweet = sweetnessOptions[0]!
      return {
        lineId: 0,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPriceSatang: product.priceSatang + sweet.priceSatang,
        quantity,
        options: [{ groupId: sweetness.id, groupName: sweetness.name, optionId: sweet.id, name: sweet.name, priceSatang: sweet.priceSatang, costSatang: sweet.costSatang }] as LineOption[],
        note: null,
      }
    }
    const plainLine = (product: ProductEntity, quantity: number) => ({
      lineId: 0,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unitPriceSatang: product.priceSatang,
      quantity,
      options: [] as LineOption[],
      note: null,
    })
    const opener = cashierUsers[0]!
    const liveOrders: { table: string; minutesAgo: number; lines: ReturnType<typeof plainLine>[] }[] = [
      { table: 'A3', minutesAgo: 35, lines: [plainLine(snackOf(3), 2), sweetLine(drinkOf(0), 2)] },
      { table: 'B2', minutesAgo: 22, lines: [plainLine(snackOf(11), 1), sweetLine(drinkOf(4), 1)] },
      { table: 'T1', minutesAgo: 12, lines: [plainLine(snackOf(7), 2), sweetLine(drinkOf(2), 1)] },
    ]
    for (const live of liveOrders) {
      clock.freezeMs(bootMs - live.minutesAgo * MINUTE)
      await orders.create(
        OrderEntity.open({
          memberId: null, branchId: branch.id, label: null, tableId: tableByName.get(live.table)!,
          openedById: opener.id, openedByName: opener.displayName, items: live.lines,
        }),
      )
    }
    // One order already paid at today's till, linked to its sale.
    clock.freezeMs(bootMs - 9 * MINUTE)
    const paidOrder = await orders.create(
      OrderEntity.open({
        memberId: null, branchId: branch.id, label: null, tableId: tableByName.get('B1')!,
        openedById: opener.id, openedByName: opener.displayName,
        items: [plainLine(snackOf(21), 1), sweetLine(drinkOf(6), 2)],
      }),
    )
    if (todayFirstSale) {
      clock.freezeMs(todayFirstSale.createdAt.getTime() + MINUTE)
      await orders.save(paidOrder.markPaid(todayFirstSale.id))
    }

    const { total: completedSales } = await sales.findHeaders({ branchId: branch.id, status: 'completed', limit: 1, offset: 0 })
    const { total: voidedSales } = await sales.findHeaders({ branchId: branch.id, status: 'voided', limit: 1, offset: 0 })
    const openOrders = await orders.findAll({ branchId: branch.id, status: 'open', limit: 1, offset: 0 })

    return {
      users: 1 + cashierUsers.length,
      categories: CATEGORY_NAMES.length,
      products: catalog.length,
      sales: completedSales,
      voided: voidedSales,
      shifts: 1 + pastShifts.size,
      orders: openOrders.total + 1,
    }
  } finally {
    clock.resume()
  }
}
