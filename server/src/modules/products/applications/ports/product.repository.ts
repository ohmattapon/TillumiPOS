import type { Page } from '../../../../domains/page'
import type { ProductEntity } from '../../../../domains/product.domain'

export interface IFindProductsQuery {
  /** Stock is read for this branch; the catalogue itself is shared by all branches. */
  branchId: number
  /** Matches name or SKU case-insensitively, or the barcode exactly. `%` and `_` are literal. */
  q?: string
  /**
   * An exact product or pack barcode (active or not) or case-insensitive SKU, used by scanners independently of
   * catalogue pages. A product barcode hit comes first, then a pack barcode hit, then a SKU hit.
   */
  code?: string
  categoryId?: number
  includeInactive?: boolean
  isActive?: boolean
  /** Tracked stock at or below this quantity in the requested branch. */
  stockAtMost?: number
  sort?: 'name' | 'stock'
  limit?: number
  offset?: number
}

/** Every product read comes back with all its packs (active or not), ordered by pack id. */
export interface IProductRepository {
  /** One page ordered by name, with the total that match. Inactive products are left out unless asked for. */
  findAll(query: IFindProductsQuery): Promise<Page<ProductEntity>>
  findById(id: number, branchId: number): Promise<ProductEntity | null>
  /**
   * The products with these ids, ordered by id and row-locked until the surrounding
   * unit of work ends. Missing ids are simply absent from the result.
   */
  findManyForUpdate(ids: number[], branchId: number): Promise<ProductEntity[]>
  /**
   * Stores the product and its packs (all must have id 0). Throws DomainConflictError: DUPLICATE for a taken SKU or
   * product barcode, BARCODE_TAKEN for a barcode used by another product's pack (or a pack barcode used by another
   * product), IN_USE for an unknown category; DomainError PACK_NOT_FOUND for a pack id that is not this product's.
   */
  create(entity: ProductEntity, branchId: number): Promise<ProductEntity>
  /**
   * Overwrites the editable fields and writes the packs as a set: id 0 is added, a known id is updated and a stored
   * pack left out is deleted (PACK_IN_USE when a sale line points to it). Stock and image are untouched; otherwise
   * the same errors as create.
   */
  update(entity: ProductEntity, branchId: number): Promise<ProductEntity>
  /** Adds `delta` to the branch's stock and returns the new balance, or null when the product does not track stock. */
  adjustStock(id: number, branchId: number, delta: number): Promise<number | null>
  setImageKey(id: number, imageKey: string | null, branchId: number): Promise<ProductEntity>
}

const productRepositoryTokenSymbol: unique symbol = Symbol('IProductRepository')
export const productRepositoryToken = productRepositoryTokenSymbol.toString()
