import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { ProductEntity, type ProductEntityProps } from '../../../../domains/product.domain'
import type { IFindProductsQuery, IProductRepository } from '../../applications/ports/product.repository'

// The catalogue row without the branch's stock: stock lives in its own map,
// and a product that has never moved in the branch simply has no entry there.
type ProductRow = Omit<ProductEntityProps, 'stockQty'>

// Same codes and messages the API has always answered for these conflicts.
const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

/**
 * No-database product store: one Map for the catalogue plus one for
 * per-branch stock, ids assigned from 1 in creation order.
 * Category existence is a database foreign key in the drizzle twin; memory
 * has no cross-module reads, so only the seeder's valid data reaches here.
 */
@injectable()
export class MemoryProductRepository implements IProductRepository {
  private readonly rows = new Map<number, ProductRow>()
  private readonly stock = new Map<string, number>()
  private nextId = 1
  private nextSku = 1

  async nextSkuNumber() {
    // No-op by design: a single process needs no advisory lock around the
    // counter. This must stay lock-free only here — the drizzle twin locks
    // SKU writes until the caller's unit of work ends.
    return this.nextSku++
  }

  async skuExists(sku: string) {
    const wanted = sku.toLowerCase()
    return [...this.rows.values()].some((row) => row.sku.toLowerCase() === wanted)
  }

  async findAll(query: IFindProductsQuery) {
    const term = query.q?.trim() ?? ''
    const lowered = term.toLowerCase()
    const matching = [...this.rows.values()].filter(
      (row) =>
        (query.productType === undefined || row.productType === query.productType) &&
        (query.isActive !== undefined ? row.isActive === query.isActive : query.includeInactive ? true : row.isActive) &&
        (query.stockAtMost === undefined || (row.trackStock && this.stockOf(row.id, query.branchId) <= query.stockAtMost)) &&
        (query.categoryId === undefined || row.categoryId === query.categoryId) &&
        (!query.code || row.barcode === query.code || row.sku.toLowerCase() === query.code.toLowerCase()) &&
        (!term ||
          row.name.toLowerCase().includes(lowered) ||
          row.sku.toLowerCase().includes(lowered) ||
          row.barcode === term),
    )
    const byName = (a: ProductRow, b: ProductRow) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id
    const ordered =
      query.code !== undefined
        ? [...matching].sort((a, b) =>
            a.barcode === query.code && b.barcode !== query.code
              ? -1
              : b.barcode === query.code && a.barcode !== query.code
                ? 1
                : byName(a, b),
          )
        : query.sort === 'stock'
          ? [...matching].sort(
              (a, b) => this.stockOf(a.id, query.branchId) - this.stockOf(b.id, query.branchId) || byName(a, b),
            )
          : [...matching].sort(byName)
    const items = ordered
      .slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 500))
      .map((row) => this.entityOf(row, query.branchId))
    return { items, total: matching.length }
  }

  async findById(id: number, branchId: number) {
    const row = this.rows.get(id)
    return row ? this.entityOf(row, branchId) : null
  }

  async findManyForUpdate(ids: number[], branchId: number) {
    if (ids.length === 0) return []
    // Ordered by id so concurrent units of work take their locks in the same
    // order and cannot deadlock. The lock itself is a no-op by design: a
    // single process has no concurrent transactions to serialize. This must
    // stay a no-op only here — the drizzle twin locks the product rows first
    // and only then reads stock in a second statement.
    const wanted = new Set(ids)
    return [...this.rows.values()]
      .filter((row) => wanted.has(row.id))
      .sort((a, b) => a.id - b.id)
      .map((row) => this.entityOf(row, branchId))
  }

  async create(entity: ProductEntity, branchId: number) {
    this.assertNoConflicts(entity, null)
    const { stockQty: _none, ...values } = entity.toSnapshot()
    const row: ProductRow = { ...values, id: this.nextId++ }
    this.rows.set(row.id, row)
    return this.entityOf(row, branchId)
  }

  async update(entity: ProductEntity, branchId: number) {
    const stored = this.rows.get(entity.id)
    if (!stored) throw new DomainNotFoundError('ไม่พบสินค้า')
    this.assertNoConflicts(entity, entity.id)
    // Stock and image have their own write paths and must not be overwritten from a stale read.
    const { stockQty: _stock, imageKey: _image, ...values } = entity.toSnapshot()
    const kept: ProductRow = { ...values, id: stored.id, imageKey: stored.imageKey }
    this.rows.set(stored.id, kept)
    return this.entityOf(kept, branchId)
  }

  async adjustStock(id: number, branchId: number, delta: number) {
    const product = this.rows.get(id)
    if (!product?.trackStock) return null
    const next = this.stockOf(id, branchId) + delta
    this.stock.set(this.stockKey(id, branchId), next)
    return next
  }

  async setImageKey(id: number, imageKey: string | null, branchId: number) {
    const stored = this.rows.get(id)
    if (!stored) throw new DomainNotFoundError('ไม่พบสินค้า')
    const row: ProductRow = { ...stored, imageKey }
    this.rows.set(id, row)
    return this.entityOf(row, branchId)
  }

  private entityOf(row: ProductRow, branchId: number) {
    return new ProductEntity({ ...row, stockQty: this.stockOf(row.id, branchId) })
  }

  private stockKey(id: number, branchId: number) {
    return `${branchId}:${id}`
  }

  // A product that has never moved in the branch has no stock row, which means none on the shelf.
  private stockOf(id: number, branchId: number) {
    return this.stock.get(this.stockKey(id, branchId)) ?? 0
  }

  // The database unique indexes are byte-exact, so exact matches mirror the
  // drizzle twin; the case-insensitive skuExists check stays a separate read.
  private assertNoConflicts(entity: ProductEntity, selfId: number | null) {
    const clash = [...this.rows.values()].some(
      (row) =>
        row.id !== selfId &&
        (row.sku === entity.sku || (entity.barcode !== null && row.barcode === entity.barcode)),
    )
    if (clash) throw duplicate()
  }
}
