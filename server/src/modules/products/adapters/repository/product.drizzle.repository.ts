import { and, count, eq, ilike, inArray, lte, or, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { ProductEntity } from '../../../../domains/product.domain'
import { branchStock } from '../../../../infrastructure/database/schema/branches'
import { products } from '../../../../infrastructure/database/schema/products'
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

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

// Same codes and messages the API has always answered for these database conflicts.
const translate = (error: unknown): unknown => {
  if (isUniqueViolation(error)) return new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')
  if (isForeignKeyViolation(error))
    return new DomainConflictError('ข้อมูลนี้ถูกอ้างอิงอยู่ หรืออ้างถึงข้อมูลที่ไม่มีอยู่', 'IN_USE')
  return error
}

/** The catalogue joined with the stock of one branch. */
const inBranch = (branchId: number) =>
  and(eq(branchStock.productId, products.id), eq(branchStock.branchId, branchId))

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
      query.code ? or(eq(products.barcode, query.code), sql`lower(${products.sku}) = ${query.code.toLowerCase()}`) : undefined,
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
        ? [sql`case when ${products.barcode} = ${query.code} then 0 else 1 end`, products.name, products.id]
        : query.sort === 'stock' ? [sql`coalesce(${branchStock.qty}, 0)`, products.name, products.id] : [products.name, products.id]))
      .limit(query.limit ?? 500)
      .offset(query.offset ?? 0)
    const [counted] = await currentExecutor().select({ total: count() }).from(products)
      .leftJoin(branchStock, inBranch(query.branchId)).where(matching)

    return { items: rows.map((row) => new ProductEntity(row)), total: counted!.total }
  }

  async findById(id: number, branchId: number) {
    const [row] = await currentExecutor()
      .select(columns)
      .from(products)
      .leftJoin(branchStock, inBranch(branchId))
      .where(eq(products.id, id))
    return row ? new ProductEntity(row) : null
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
    return rows.map((row) => new ProductEntity(row))
  }

  async create(entity: ProductEntity, branchId: number) {
    const { id: _unassigned, stockQty: _none, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(products).values(values).returning({ id: products.id })
      return (await this.findById(row!.id, branchId))!
    } catch (error) {
      throw translate(error)
    }
  }

  async update(entity: ProductEntity, branchId: number) {
    // Stock and image have their own write paths and must not be overwritten from a stale read.
    const { id, stockQty: _stock, imageKey: _image, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().update(products).set(values).where(eq(products.id, id)).returning({ id: products.id })
      if (!row) throw new DomainNotFoundError('ไม่พบสินค้า')
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
}
