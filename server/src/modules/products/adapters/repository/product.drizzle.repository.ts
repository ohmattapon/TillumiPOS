import { and, count, eq, ilike, inArray, lte, ne, or, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { ProductPack } from '../../../../domains/product-pack'
import { ProductEntity, type ProductEntityProps } from '../../../../domains/product.domain'
import { branchStock } from '../../../../infrastructure/database/schema/branches'
import { productPacks, products } from '../../../../infrastructure/database/schema/products'
import { isForeignKeyViolation, isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IFindProductsQuery, IProductRepository } from '../../applications/ports/product.repository'

const columns = {
  id: products.id,
  sku: products.sku,
  barcode: products.barcode,
  name: products.name,
  categoryId: products.categoryId,
  priceSatang: products.priceSatang,
  costSatang: products.costSatang,
  trackStock: products.trackStock,
  // A product that has never moved in the branch has no stock row, which means none on the shelf.
  stockQty: sql<number>`coalesce(${branchStock.qty}, 0)`.mapWith(Number),
  isActive: products.isActive,
  imageKey: products.imageKey,
}

const packColumns = {
  id: productPacks.id,
  productId: productPacks.productId,
  barcode: productPacks.barcode,
  size: productPacks.size,
  priceSatang: productPacks.priceSatang,
  isActive: productPacks.isActive,
}

// Every write that brings a barcode into use takes this lock first, so the check that a barcode is free
// across products and packs (two tables, so no single unique index can enforce it) cannot race another write.
const BARCODE_LOCK_KEY = 731_092_448

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

// Same codes and messages the API has always answered for these database conflicts.
const translate = (error: unknown): unknown => {
  if (isUniqueViolation(error)) return new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')
  if (isForeignKeyViolation(error))
    return new DomainConflictError('ข้อมูลนี้ถูกอ้างอิงอยู่ หรืออ้างถึงข้อมูลที่ไม่มีอยู่', 'IN_USE')
  return error
}

const barcodeTaken = (barcode: string) =>
  new DomainConflictError(`บาร์โค้ด ${barcode} ถูกใช้แล้ว`, 'BARCODE_TAKEN', { barcode })

const packNotFound = (packId: number) => new DomainError('ไม่พบแพ็กสินค้านี้', 'PACK_NOT_FOUND', { packId })

const packValues = (pack: ProductPack) => ({
  barcode: pack.barcode,
  size: pack.size,
  priceSatang: pack.priceSatang,
  isActive: pack.isActive,
})

/** The catalogue joined with the stock of one branch. */
const inBranch = (branchId: number) =>
  and(eq(branchStock.productId, products.id), eq(branchStock.branchId, branchId))

/** The product of the outer query has a pack with this barcode, active or not. */
const hasPackBarcode = (code: string) =>
  sql`exists (select 1 from ${productPacks} where ${productPacks.productId} = ${products.id} and ${productPacks.barcode} = ${code})`

@injectable()
export class DrizzleProductRepository implements IProductRepository {
  async findAll(query: IFindProductsQuery) {
    const term = query.q?.trim()
    const pattern = term && `%${escapeLike(term)}%`

    const matching = and(
      query.isActive !== undefined ? eq(products.isActive, query.isActive)
        : query.includeInactive ? undefined : eq(products.isActive, true),
      query.stockAtMost !== undefined
        ? and(eq(products.trackStock, true), lte(sql`coalesce(${branchStock.qty}, 0)`, query.stockAtMost))
        : undefined,
      query.categoryId ? eq(products.categoryId, query.categoryId) : undefined,
      query.code
        ? or(eq(products.barcode, query.code), hasPackBarcode(query.code), sql`lower(${products.sku}) = ${query.code.toLowerCase()}`)
        : undefined,
      pattern
        ? or(ilike(products.name, pattern), ilike(products.sku, pattern), eq(products.barcode, term!))
        : undefined,
    )

    const rows = await currentExecutor()
      .select(columns)
      .from(products)
      .leftJoin(branchStock, inBranch(query.branchId))
      .where(matching)
      .orderBy(...(query.code
        ? [sql`case when ${products.barcode} = ${query.code} then 0 when ${hasPackBarcode(query.code)} then 1 else 2 end`, products.name, products.id]
        : query.sort === 'stock' ? [sql`coalesce(${branchStock.qty}, 0)`, products.name, products.id] : [products.name, products.id]))
      .limit(query.limit ?? 500)
      .offset(query.offset ?? 0)
    const [counted] = await currentExecutor().select({ total: count() }).from(products)
      .leftJoin(branchStock, inBranch(query.branchId)).where(matching)

    return { items: await this.withPacks(rows), total: counted!.total }
  }

  async findById(id: number, branchId: number) {
    const [row] = await currentExecutor()
      .select(columns)
      .from(products)
      .leftJoin(branchStock, inBranch(branchId))
      .where(eq(products.id, id))
    return row ? (await this.withPacks([row]))[0]! : null
  }

  async findManyForUpdate(ids: number[], branchId: number) {
    // Ordered by id so concurrent units of work take their locks in the same order and cannot deadlock.
    // The product rows are the lock: the stock row may not exist yet, and holding the product also
    // serializes every branch's change to its stock.
    await currentExecutor()
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.id, ids))
      .orderBy(products.id)
      .for('update')

    // Read in a second statement, once the locks are held. A single locked join would re-check only the
    // locked rows after waiting and would hand back a stale stock row, letting two sales oversell.
    const rows = await currentExecutor()
      .select(columns)
      .from(products)
      .leftJoin(branchStock, inBranch(branchId))
      .where(inArray(products.id, ids))
      .orderBy(products.id)
    return this.withPacks(rows)
  }

  async create(entity: ProductEntity, branchId: number) {
    const { id: _unassigned, stockQty: _none, packs = [], ...values } = entity.toSnapshot()
    try {
      const unsaved = packs.find((pack) => pack.id !== 0)
      if (unsaved) throw packNotFound(unsaved.id)
      await this.assertBarcodesFree(entity, packs)
      const [row] = await currentExecutor().insert(products).values(values).returning({ id: products.id })
      await this.writePacks(row!.id, packs)
      return (await this.findById(row!.id, branchId))!
    } catch (error) {
      throw translate(error)
    }
  }

  async update(entity: ProductEntity, branchId: number, { writePacks }: { writePacks: boolean }) {
    // Stock and image have their own write paths and must not be overwritten from a stale read; so do packs not being written.
    const { id, stockQty: _stock, imageKey: _image, packs = [], ...values } = entity.toSnapshot()
    try {
      await this.assertBarcodesFree(entity, writePacks ? packs : [])
      const [row] = await currentExecutor().update(products).set(values).where(eq(products.id, id)).returning({ id: products.id })
      if (!row) throw new DomainNotFoundError('ไม่พบสินค้า')
      if (writePacks) await this.writePacks(id, packs)
      return (await this.findById(id, branchId))!
    } catch (error) {
      throw translate(error)
    }
  }

  async adjustStock(id: number, branchId: number, delta: number) {
    const [product] = await currentExecutor()
      .select({ trackStock: products.trackStock })
      .from(products)
      .where(eq(products.id, id))
    if (!product?.trackStock) return null

    const [row] = await currentExecutor()
      .insert(branchStock)
      .values({ branchId, productId: id, qty: delta })
      .onConflictDoUpdate({
        target: [branchStock.branchId, branchStock.productId],
        set: { qty: sql`${branchStock.qty} + ${delta}` },
      })
      .returning({ qty: branchStock.qty })
    return row!.qty
  }

  async setImageKey(id: number, imageKey: string | null, branchId: number) {
    const [row] = await currentExecutor()
      .update(products)
      .set({ imageKey })
      .where(eq(products.id, id))
      .returning({ id: products.id })
    if (!row) throw new DomainNotFoundError('ไม่พบสินค้า')
    return (await this.findById(id, branchId))!
  }

  /** Attaches the packs of all the given products, read in one query and ordered by pack id. */
  private async withPacks(rows: Omit<ProductEntityProps, 'packs'>[]): Promise<ProductEntity[]> {
    if (rows.length === 0) return []
    const packRows = await currentExecutor()
      .select(packColumns)
      .from(productPacks)
      .where(inArray(productPacks.productId, rows.map((row) => row.id)))
      .orderBy(productPacks.id)
    const byProduct = new Map<number, ProductPack[]>()
    for (const { productId, ...pack } of packRows) byProduct.set(productId, [...(byProduct.get(productId) ?? []), pack])
    return rows.map((row) => new ProductEntity({ ...row, packs: byProduct.get(row.id) ?? [] }))
  }

  /**
   * Refuses a pack barcode that is another product's barcode or pack, and a product barcode that is another
   * product's pack. Product barcode against product barcode stays with the unique index (DUPLICATE).
   */
  private async assertBarcodesFree(entity: ProductEntity, packs: readonly ProductPack[]): Promise<void> {
    const packBarcodes = packs.map((pack) => pack.barcode)
    const ownBarcodes = entity.barcode === null ? packBarcodes : [entity.barcode, ...packBarcodes]
    if (ownBarcodes.length === 0) return
    await currentExecutor().execute(sql`select pg_advisory_xact_lock(${BARCODE_LOCK_KEY})`)

    // Separate statements from the lock: under read committed each one sees what was committed before it waited.
    const [asPack] = await currentExecutor()
      .select({ barcode: productPacks.barcode })
      .from(productPacks)
      .where(and(inArray(productPacks.barcode, ownBarcodes), ne(productPacks.productId, entity.id)))
      .limit(1)
    if (asPack) throw barcodeTaken(asPack.barcode)
    if (packBarcodes.length === 0) return

    const [asProduct] = await currentExecutor()
      .select({ barcode: products.barcode })
      .from(products)
      .where(and(inArray(products.barcode, packBarcodes), ne(products.id, entity.id)))
      .limit(1)
    if (asProduct?.barcode) throw barcodeTaken(asProduct.barcode)
  }

  /** Makes the stored packs of a product match `packs`: id 0 is inserted, a stored id left out is deleted. */
  private async writePacks(productId: number, packs: ProductPack[]): Promise<void> {
    const stored = await currentExecutor()
      .select({ id: productPacks.id, barcode: productPacks.barcode })
      .from(productPacks)
      .where(eq(productPacks.productId, productId))
    const storedIds = new Set(stored.map((pack) => pack.id))
    const foreign = packs.find((pack) => pack.id !== 0 && !storedIds.has(pack.id))
    if (foreign) throw packNotFound(foreign.id)

    const keptIds = new Set(packs.map((pack) => pack.id))
    // One at a time, so the error names the pack that a sale line still points to.
    for (const removed of stored.filter((pack) => !keptIds.has(pack.id))) {
      try {
        await currentExecutor().delete(productPacks).where(eq(productPacks.id, removed.id))
      } catch (error) {
        if (!isForeignKeyViolation(error)) throw error
        throw new DomainConflictError(`แพ็ก ${removed.barcode} ถูกขายไปแล้ว ลบไม่ได้ ให้ปิดการขายแทน`, 'PACK_IN_USE', {
          barcode: removed.barcode,
        })
      }
    }
    for (const pack of packs.filter((pack) => pack.id !== 0))
      await currentExecutor().update(productPacks).set(packValues(pack)).where(eq(productPacks.id, pack.id))
    const added = packs.filter((pack) => pack.id === 0)
    if (added.length > 0)
      await currentExecutor().insert(productPacks).values(added.map((pack) => ({ productId, ...packValues(pack) })))
  }
}
