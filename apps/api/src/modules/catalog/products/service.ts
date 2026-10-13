import { and, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { db, type Executor, type Tx } from '../../../db/client'
import { notFound } from '../../../shared/errors'
import { MediaStorage } from '../../../shared/media'
import type { CreateProduct, Product, ProductListQuery, UpdateProduct } from './model'
import { products } from './schema'

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

type Row = Omit<Product, 'imageUrl'> & { imageKey: string | null }

// The API exposes a ready-to-use URL; the storage key stays internal.
const toProduct = ({ imageKey, ...row }: Row): Product => ({
  ...row,
  imageUrl: imageKey ? MediaStorage.urlFor(imageKey) : null,
})

const IMAGE_EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

export abstract class ProductsService {
  static async list(query: ProductListQuery): Promise<Product[]> {
    const term = query.q?.trim()
    const pattern = term && `%${escapeLike(term)}%`

    const rows = await db
      .select(columns)
      .from(products)
      .where(
        and(
          query.includeInactive ? undefined : eq(products.isActive, true),
          query.categoryId ? eq(products.categoryId, query.categoryId) : undefined,
          pattern
            ? or(ilike(products.name, pattern), ilike(products.sku, pattern), eq(products.barcode, term!))
            : undefined,
        ),
      )
      .orderBy(products.name)
      .limit(query.limit ?? 500)
      .offset(query.offset ?? 0)
    return rows.map(toProduct)
  }

  static async getById(id: number, executor: Executor = db): Promise<Product> {
    const [row] = await executor.select(columns).from(products).where(eq(products.id, id))
    if (!row) throw notFound('ไม่พบสินค้า')
    return toProduct(row)
  }

  static async create(input: CreateProduct): Promise<Product> {
    const [row] = await db.insert(products).values(input).returning(columns)
    return toProduct(row!)
  }

  static async update(id: number, input: UpdateProduct): Promise<Product> {
    const [row] = await db.update(products).set(input).where(eq(products.id, id)).returning(columns)
    if (!row) throw notFound('ไม่พบสินค้า')
    return toProduct(row)
  }

  /** Uploads a new image under a fresh key, then drops the one it replaces. */
  static async setImage(id: number, file: File): Promise<Product> {
    const previousKey = await ProductsService.imageKeyOf(id)

    // A new key per upload lets browsers and the edge cache images forever.
    const key = `products/${id}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[file.type]}`
    await MediaStorage.put(key, file)

    return ProductsService.replaceImageKey(id, key, previousKey)
  }

  static async removeImage(id: number): Promise<Product> {
    return ProductsService.replaceImageKey(id, null, await ProductsService.imageKeyOf(id))
  }

  /** Row-locks the products for the rest of the transaction. Ordered by id to avoid deadlocks. */
  static async lockByIds(tx: Tx, ids: number[]): Promise<Product[]> {
    const rows = await tx
      .select(columns)
      .from(products)
      .where(inArray(products.id, ids))
      .orderBy(products.id)
      .for('update')
    return rows.map(toProduct)
  }

  /** Applies a stock delta and returns the new balance, or null when the product does not track stock. */
  static async adjustStock(tx: Tx, id: number, delta: number): Promise<number | null> {
    const [row] = await tx
      .update(products)
      .set({ stockQty: sql`${products.stockQty} + ${delta}` })
      .where(and(eq(products.id, id), eq(products.trackStock, true)))
      .returning({ stockQty: products.stockQty })
    return row?.stockQty ?? null
  }

  private static async imageKeyOf(id: number): Promise<string | null> {
    const [row] = await db.select({ imageKey: products.imageKey }).from(products).where(eq(products.id, id))
    if (!row) throw notFound('ไม่พบสินค้า')
    return row.imageKey
  }

  private static async replaceImageKey(id: number, key: string | null, previousKey: string | null) {
    const [row] = await db.update(products).set({ imageKey: key }).where(eq(products.id, id)).returning(columns)
    if (!row) throw notFound('ไม่พบสินค้า')

    // Best effort: a leftover object is harmless, so a failed cleanup must not fail the request.
    if (previousKey) await MediaStorage.delete(previousKey).catch(() => {})
    return toProduct(row)
  }
}
