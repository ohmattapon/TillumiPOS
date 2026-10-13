import type { Page } from '../../../../domains/page'
import type { ProductEntity } from '../../../../domains/product.domain'

export interface IFindProductsQuery {
  /** Stock is read for this branch; the catalogue itself is shared by all branches. */
  branchId: number
  /** Matches name or SKU case-insensitively, or the barcode exactly. `%` and `_` are literal. */
  q?: string
  categoryId?: number
  includeInactive?: boolean
  limit?: number
  offset?: number
}

export interface IProductRepository {
  /** One page ordered by name, with the total that match. Inactive products are left out unless asked for. */
  findAll(query: IFindProductsQuery): Promise<Page<ProductEntity>>
  findById(id: number, branchId: number): Promise<ProductEntity | null>
  /**
   * The products with these ids, ordered by id and row-locked until the surrounding
   * unit of work ends. Missing ids are simply absent from the result.
   */
  findManyForUpdate(ids: number[], branchId: number): Promise<ProductEntity[]>
  /** Throws DomainConflictError: DUPLICATE for a taken SKU or barcode, IN_USE for an unknown category. */
  create(entity: ProductEntity, branchId: number): Promise<ProductEntity>
  /** Overwrites the editable fields. Stock and image are untouched; same conflicts as create. */
  update(entity: ProductEntity, branchId: number): Promise<ProductEntity>
  /** Adds `delta` to the branch's stock and returns the new balance, or null when the product does not track stock. */
  adjustStock(id: number, branchId: number, delta: number): Promise<number | null>
  setImageKey(id: number, imageKey: string | null, branchId: number): Promise<ProductEntity>
}

const productRepositoryTokenSymbol: unique symbol = Symbol('IProductRepository')
export const productRepositoryToken = productRepositoryTokenSymbol.toString()
