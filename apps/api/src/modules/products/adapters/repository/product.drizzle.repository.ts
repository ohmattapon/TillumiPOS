import { and, count, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { ProductEntity } from '../../../../domains/product.domain'
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
  stockQty: products.stockQty,
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

@injectable()
export class DrizzleProductRepository implements IProductRepository {
  async findAll(query: IFindProductsQuery) {
    const term = query.q?.trim()
    const pattern = term && `%${escapeLike(term)}%`

    const matching = and(
      query.includeInactive ? undefined : eq(products.isActive, true),
      query.categoryId ? eq(products.categoryId, query.categoryId) : undefined,
      pattern
        ? or(ilike(products.name, pattern), ilike(products.sku, pattern), eq(products.barcode, term!))
        : undefined,
    )

    const rows = await currentExecutor()
      .select(columns)
      .from(products)
      .where(matching)
      .orderBy(products.name)
      .limit(query.limit ?? 500)
      .offset(query.offset ?? 0)
    const [counted] = await currentExecutor().select({ total: count() }).from(products).where(matching)

    return { items: rows.map((row) => new ProductEntity(row)), total: counted!.total }
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select(columns).from(products).where(eq(products.id, id))
    return row ? new ProductEntity(row) : null
  }

  async findManyForUpdate(ids: number[]) {
    // Ordered by id so concurrent units of work take their locks in the same order and cannot deadlock.
    const rows = await currentExecutor()
      .select(columns)
      .from(products)
      .where(inArray(products.id, ids))
      .orderBy(products.id)
      .for('update')
    return rows.map((row) => new ProductEntity(row))
  }

  async create(entity: ProductEntity) {
    const { id: _unassigned, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(products).values(values).returning(columns)
      return new ProductEntity(row!)
    } catch (error) {
      throw translate(error)
    }
  }

  async update(entity: ProductEntity) {
    // Stock and image have their own write paths and must not be overwritten from a stale read.
    const { id, stockQty: _stock, imageKey: _image, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().update(products).set(values).where(eq(products.id, id)).returning(columns)
      if (!row) throw new DomainNotFoundError('ไม่พบสินค้า')
      return new ProductEntity(row)
    } catch (error) {
      throw translate(error)
    }
  }

  async adjustStock(id: number, delta: number) {
    const [row] = await currentExecutor()
      .update(products)
      .set({ stockQty: sql`${products.stockQty} + ${delta}` })
      .where(and(eq(products.id, id), eq(products.trackStock, true)))
      .returning({ stockQty: products.stockQty })
    return row?.stockQty ?? null
  }

  async setImageKey(id: number, imageKey: string | null) {
    const [row] = await currentExecutor().update(products).set({ imageKey }).where(eq(products.id, id)).returning(columns)
    if (!row) throw new DomainNotFoundError('ไม่พบสินค้า')
    return new ProductEntity(row)
  }
}
