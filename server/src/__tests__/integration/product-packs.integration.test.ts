import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { container } from 'tsyringe'
import { MAIN_BRANCH_ID, ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'
import { DomainError } from '../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../domains/errors/domain-not-found.error'
import { ProductEntity, type ProductEntityProps } from '../../domains/product.domain'
import type { ProductPack } from '../../domains/product-pack'
import { products } from '../../infrastructure/database/schema/products'
import { currentExecutor } from '../../libs/transaction-context'
import '../../modules/di-registrations'
import { CachedProductRepository } from '../../modules/products/adapters/repository/product.cached.repository'
import { DrizzleProductRepository } from '../../modules/products/adapters/repository/product.drizzle.repository'
import type { IRepositoryReadCache } from '../../modules/shared/ports/repository-read-cache.port'
import type { IUnitOfWork } from '../../modules/shared/ports/unit-of-work.port'
import { TOKENS } from '../../modules/tokens'

const repository = container.resolve(DrizzleProductRepository)
const unitOfWork = container.resolve<IUnitOfWork>(TOKENS.UnitOfWork)
const branchId = MAIN_BRANCH_ID

let counter = 0
const product = (props: Partial<ProductEntityProps> = {}) =>
  new ProductEntity({
    id: 0,
    sku: `SKU-${++counter}`,
    barcode: null,
    name: `Product ${counter}`,
    categoryId: null,
    productType: 'normal',
    priceSatang: 1500,
    costSatang: 1000,
    trackStock: true,
    stockQty: 0,
    isActive: true,
    imageKey: null,
    ...props,
  })

const pack = (barcode: string, size: number, priceSatang: number | null = null, id = 0): ProductPack => ({
  id,
  barcode,
  size,
  priceSatang,
  isActive: true,
})

const create = (entity: ProductEntity) => unitOfWork.run(() => repository.create(entity, branchId))
const update = (entity: ProductEntity) => unitOfWork.run(() => repository.update(entity, branchId))

const rejection = async (work: Promise<unknown>) => {
  try {
    await work
  } catch (error) {
    return error as DomainError
  }
  throw new Error('expected a rejection')
}

const withPacks = () =>
  create(product({ barcode: '885000000001', packs: [pack('885000000006', 6, 8500), pack('885000000024', 24)] }))

beforeEach(async () => {
  await resetDatabase()
})

const previousMode = Bun.env.CHECKOUT_MODE
const key = () => crypto.randomUUID()

/** Seeds a product with stock over HTTP, then attaches one pack through the repository. */
async function seedStockedPack(session: Session, packSize: number, priceSatang: number) {
  const tea = await seedProduct(session, { priceSatang: 2500, stock: 24 })
  const entity = (await repository.findById(tea.id, branchId))!
  const barcode = `885${String(tea.id).padStart(9, '0')}`

  await update(new ProductEntity({ ...entity.toSnapshot(), packs: [pack(barcode, packSize, priceSatang)] }))
  const saved = (await repository.findById(tea.id, branchId))!

  return { tea, saved: saved.toSnapshot().packs[0]! }
}

describe('a pack sold in a shift', () => {
  let owner: Session
  let shiftId: number

  beforeEach(async () => {
    Bun.env.CHECKOUT_MODE = 'shifts'
    owner = await signIn('owner')

    const registerId = ok(await owner.apiV2.registers.get()).items[0]!.id
    shiftId = ok(
      await owner.apiV2.shifts.post({ registerId, openingCashSatang: 0 }, { headers: { 'idempotency-key': key() } }),
    ).id
  })

  afterEach(() => {
    if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
    else Bun.env.CHECKOUT_MODE = previousMode
  })

  test('a pack sold in a shift is charged and counted as the pack', async () => {
    const { tea, saved } = await seedStockedPack(owner, 6, 13_000)

    const sale = ok(
      await owner.apiV2.sales.post(
        {
          shiftId,
          items: [{ productId: tea.id, quantity: 1, packId: saved.id }],
          payments: [{ method: 'cash', amountSatang: 13_000 }],
        },
        { headers: { 'idempotency-key': key() } },
      ),
    )

    expect(sale.totalSatang).toBe(13_000)
    expect(sale.items[0]!.packSize).toBe(6)
    expect(ok(await owner.api.catalog.products({ id: tea.id }).get()).stockQty).toBe(18)

    const quote = ok(await owner.api.quotes.post({ lines: [{ productId: tea.id, quantity: 1, packId: saved.id }] }))
    const quoted = ok(
      await owner.apiV2.sales.post(
        {
          shiftId,
          quoteId: quote.id,
          items: [{ productId: tea.id, quantity: 1, packId: saved.id }],
          payments: [{ method: 'cash', amountSatang: 13_000 }],
        },
        { headers: { 'idempotency-key': key() } },
      ),
    )

    expect(quoted.totalSatang).toBe(13_000)
  })
})

describe('product packs', () => {
  test('a created product comes back with its packs, ordered and with ids', async () => {
    const created = await withPacks()
    const found = await repository.findById(created.id, branchId)

    expect(found!.packs).toEqual([
      { id: expect.any(Number), barcode: '885000000006', size: 6, priceSatang: 8500, isActive: true },
      { id: expect.any(Number), barcode: '885000000024', size: 24, priceSatang: null, isActive: true },
    ])
    expect(found!.packs[0]!.id).toBeLessThan(found!.packs[1]!.id)
    expect(created.packs).toEqual(found!.packs)
  })

  test('every read returns packs', async () => {
    const created = await withPacks()
    await create(product({ name: 'No packs' }))

    const page = await repository.findAll({ branchId })
    const locked = await unitOfWork.run(() => repository.findManyForUpdate([created.id], branchId))

    expect(page.items.find((item) => item.id === created.id)!.packs).toHaveLength(2)
    expect(page.items.find((item) => item.name === 'No packs')!.packs).toEqual([])
    expect(locked[0]!.packs).toHaveLength(2)
  })

  test('a pack barcode finds its product once', async () => {
    const created = await withPacks()
    await create(product({ name: 'Other' }))

    const page = await repository.findAll({ branchId, code: '885000000006' })

    expect(page.total).toBe(1)
    expect(page.items.map((item) => item.id)).toEqual([created.id])
  })

  test('an inactive pack is still found by its barcode', async () => {
    const created = await create(product({ packs: [{ ...pack('885000000006', 6), isActive: false }] }))

    const page = await repository.findAll({ branchId, code: '885000000006' })

    expect(page.items.map((item) => item.id)).toEqual([created.id])
  })

  test('a code orders a product barcode first, then a pack barcode, then a SKU', async () => {
    const bySku = await create(product({ sku: 'C1', name: 'A by sku' }))
    const byPack = await create(product({ name: 'B by pack', packs: [pack('c1', 6)] }))
    // The barcode check refuses this through the repository, so write it as a row that predates the check.
    const [byBarcode] = await currentExecutor().insert(products)
      .values({ sku: 'OTHER', name: 'C by barcode', barcode: 'c1', priceSatang: 100 })
      .returning({ id: products.id })

    const page = await repository.findAll({ branchId, code: 'c1' })

    expect(page.items.map((item) => item.id)).toEqual([byBarcode!.id, byPack.id, bySku.id])
  })

  test('a pack barcode cannot be used by another product', async () => {
    const first = await withPacks()

    const asBarcode = await rejection(create(product({ barcode: '885000000006' })))
    const asPack = await rejection(create(product({ packs: [pack('885000000006', 12)] })))
    // The entity itself refuses a product whose own pack shares its barcode, so the rejection is synchronous.
    const ownBarcode = await rejection((async () => update(first.with({ barcode: '885000000024' })))())

    expect(ownBarcode).toMatchObject({ code: 'BARCODE_TAKEN', params: { barcode: '885000000024' } })
    expect(asBarcode).toMatchObject({ code: 'BARCODE_TAKEN', params: { barcode: '885000000006' } })
    expect(asPack).toMatchObject({ code: 'BARCODE_TAKEN', params: { barcode: '885000000006' } })
  })

  test("changing a product's barcode to another product's pack barcode is taken", async () => {
    await withPacks()
    const second = await create(product())

    const error = await rejection(update(second.with({ barcode: '885000000024' })))

    expect(error).toMatchObject({ code: 'BARCODE_TAKEN', params: { barcode: '885000000024' } })
  })

  test("a pack may not reuse another product's barcode", async () => {
    await create(product({ barcode: 'P-1' }))

    const error = await rejection(create(product({ packs: [pack('P-1', 6)] })))

    expect(error).toMatchObject({ code: 'BARCODE_TAKEN', params: { barcode: 'P-1' } })
  })

  test('two concurrent updates adding the same pack barcode: exactly one wins', async () => {
    const a = await create(product())
    const b = await create(product())

    const results = await Promise.allSettled([
      update(a.with({ packs: [pack('X1', 6)] })),
      update(b.with({ packs: [pack('X1', 12)] })),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const failed = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
    expect(failed.reason).toMatchObject({ code: 'BARCODE_TAKEN', params: { barcode: 'X1' } })
  })

  test('update writes packs as a set: removed, kept and added', async () => {
    const created = await withPacks()
    const [, kept] = created.packs

    const saved = await update(created.with({ packs: [{ ...kept!, priceSatang: 30000 }, pack('885000000012', 12, 16000)] }))
    const found = await repository.findById(created.id, branchId)

    expect(found!.packs).toEqual([
      { id: kept!.id, barcode: '885000000024', size: 24, priceSatang: 30000, isActive: true },
      { id: expect.any(Number), barcode: '885000000012', size: 12, priceSatang: 16000, isActive: true },
    ])
    expect(saved.packs).toEqual(found!.packs)
    expect((await repository.findAll({ branchId, code: '885000000006' })).total).toBe(0)
  })

  test('an update without packs in the changes leaves the stored packs alone', async () => {
    const created = await withPacks()

    const saved = await update(created.with({ name: 'Renamed' }))

    expect(saved.name).toBe('Renamed')
    expect(saved.packs).toEqual(created.packs)
  })

  test('a removed barcode can be used by another product', async () => {
    const created = await withPacks()
    await update(created.with({ packs: [] }))

    const other = await create(product({ packs: [pack('885000000006', 6)] }))

    expect(other.packs.map((item) => item.barcode)).toEqual(['885000000006'])
  })

  test("a pack id of another product is PACK_NOT_FOUND", async () => {
    const first = await withPacks()
    const second = await create(product())
    const foreign = first.packs[0]!

    const onUpdate = await rejection(update(second.with({ packs: [{ ...foreign, barcode: 'NEW-1' }] })))
    const onCreate = await rejection(create(product({ packs: [{ ...foreign, barcode: 'NEW-2' }] })))

    for (const error of [onUpdate, onCreate]) {
      expect(error).toBeInstanceOf(DomainError)
      expect(error).not.toBeInstanceOf(DomainNotFoundError)
      expect(error).toMatchObject({ code: 'PACK_NOT_FOUND', params: { packId: foreign.id } })
    }
    expect((await repository.findById(first.id, branchId))!.packs).toEqual(first.packs)
  })

  test('a sold pack cannot be deleted', async () => {
    await signIn('owner') // a cashier for the sale row
    const created = await withPacks()
    const sold = created.packs[0]!
    await currentExecutor().execute(sql`
      with sale as (
        insert into sales (receipt_no, branch_id, subtotal_satang, total_satang, vat_satang, paid_satang, change_satang, cashier_id, cashier_name)
        values ('R-1', ${branchId}, 8500, 8500, 556, 8500, 0, (select min(id) from users), 'owner')
        returning id
      )
      insert into sale_items (sale_id, product_id, product_name, sku, unit_price_satang, unit_cost_satang, quantity, line_total_satang, pack_id, pack_size)
      select id, ${created.id}, 'x', 'x', 8500, 6000, 1, 8500, ${sold.id}, 6 from sale
    `)

    const error = await rejection(update(created.with({ packs: [created.packs[1]!] })))

    expect(error).toMatchObject({ code: 'PACK_IN_USE', params: { barcode: '885000000006' } })
    expect((await repository.findById(created.id, branchId))!.packs).toHaveLength(2)
  })

  test('an unknown category is still IN_USE and a taken SKU still DUPLICATE', async () => {
    await create(product({ sku: 'DUP' }))

    expect(await rejection(create(product({ sku: 'DUP' })))).toMatchObject({ code: 'DUPLICATE' })
    expect(await rejection(create(product({ categoryId: 999 })))).toMatchObject({ code: 'IN_USE' })
  })
})

describe('cached product packs', () => {
  test('a cached page rebuilds its packs', async () => {
    // Serializes through JSON like Redis would, so only what the snapshot carries survives.
    const stored = new Map<string, string>()
    const jsonCache: IRepositoryReadCache = {
      async read(_group, key, _ttl, load, serialize, deserialize) {
        if (!stored.has(key)) stored.set(key, JSON.stringify(serialize(await load())))
        return deserialize(JSON.parse(stored.get(key)!))
      },
      async changed() {},
    }
    const cached = new CachedProductRepository(repository, jsonCache)
    const created = await withPacks()

    await cached.findAll({ branchId })
    const page = await cached.findAll({ branchId })

    expect(page.items[0]!.packs).toEqual(created.packs)
  })
})
