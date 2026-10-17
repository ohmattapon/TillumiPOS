import 'reflect-metadata'
import { and, eq, inArray } from 'drizzle-orm'
import { container } from 'tsyringe'
import { branchStock } from './schema/branches'
import { categories as productCategories } from './schema/categories'
import { products } from './schema/products'
import { users } from './schema/users'
import { CreateCategoryUseCase } from '../../modules/categories/applications/usecases/create-category.usecase'
import { CreateProductUseCase } from '../../modules/products/applications/usecases/create-product.usecase'
import { SetProductImageUseCase } from '../../modules/products/applications/usecases/set-product-image.usecase'
import { ReceiveStockUseCase } from '../../modules/inventory/applications/usecases/receive-stock.usecase'
import { db } from '../../libs/db'

type DemoProduct = {
  code: string
  product_name: string | null
  product_name_th: string | null
  brands: string | null
  quantity: string | null
  categories_tags_en: string[] | null
  sourceImageUrl: string
  localImage: string
}

const categoryNames = [
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

type DemoCategory = (typeof categoryNames)[number]

function categoryFor(product: DemoProduct): DemoCategory {
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

function stableNumber(value: string): number {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return hash >>> 0
}

function productName(product: DemoProduct): string {
  const name = product.product_name_th?.trim() || product.product_name?.trim() || 'สินค้า'
  const brand = product.brands?.split(',')[0]?.trim()
  const hasBrand = brand && name.toLocaleLowerCase().includes(brand.toLocaleLowerCase())
  const quantity = product.quantity?.trim()
  const value = [brand && !hasBrand ? brand : null, name, quantity].filter(Boolean).join(' ')
  return Array.from(value).slice(0, 200).join('')
}

function prices(product: DemoProduct, category: DemoCategory) {
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

export async function seedDemoProductCatalog(ownerId: number, branchId: number) {
  const [actor] = await db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.id, ownerId))
  if (!actor) throw new Error('The demo catalogue needs an existing owner')
  const manifest = (await Bun.file(new URL('./demo-product-catalog.json', import.meta.url)).json()) as DemoProduct[]
  if (manifest.length < 400 || manifest.length > 500) {
    throw new Error(`Expected 400–500 demo products, found ${manifest.length}`)
  }

  const existingCategories = await db
    .select({ id: productCategories.id, name: productCategories.name })
    .from(productCategories)
  const categoryIds = new Map(existingCategories.map((category) => [category.name, category.id]))
  const createCategory = container.resolve(CreateCategoryUseCase)
  for (const [sortOrder, name] of categoryNames.entries()) {
    if (!categoryIds.has(name)) {
      const created = await createCategory.execute({ name, sortOrder: sortOrder + 10 })
      categoryIds.set(name, created.id)
    }
  }

  const skus = manifest.map((product) => `OFF-${product.code}`)
  const existingProducts = await db
    .select({ id: products.id, sku: products.sku, imageKey: products.imageKey })
    .from(products)
    .where(inArray(products.sku, skus))
  const existingBarcodes = await db
    .select({ barcode: products.barcode })
    .from(products)
    .where(inArray(products.barcode, manifest.map((product) => product.code)))
  const occupiedBarcodes = new Set(existingBarcodes.map((product) => product.barcode))
  const productBySku = new Map(existingProducts.map((product) => [product.sku, product]))
  const stockedRows = existingProducts.length
    ? await db
        .select({ productId: branchStock.productId })
        .from(branchStock)
        .where(
          and(
            eq(branchStock.branchId, branchId),
            inArray(branchStock.productId, existingProducts.map((product) => product.id)),
          ),
        )
    : []
  const stockedProductIds = new Set(stockedRows.map((row) => row.productId))
  const createProduct = container.resolve(CreateProductUseCase)
  const setProductImage = container.resolve(SetProductImageUseCase)
  const receiveStock = container.resolve(ReceiveStockUseCase)
  let createdCount = 0
  let imageCount = 0
  let existingCount = 0

  for (const [index, source] of manifest.entries()) {
    const sku = `OFF-${source.code}`
    const category = categoryFor(source)
    const categoryId = categoryIds.get(category)
    if (!categoryId) throw new Error(`Category not found: ${category}`)

    let existing = productBySku.get(sku)
    let productId: number
    if (existing) {
      existingCount++
      productId = existing.id
    } else {
      const price = prices(source, category)
      const product = await createProduct.execute(
        {
          sku,
          barcode: occupiedBarcodes.has(source.code) ? null : source.code,
          name: productName(source),
          categoryId,
          ...price,
          trackStock: true,
        },
        branchId,
        actor,
      )
      productId = product.id
      productBySku.set(sku, { id: product.id, sku, imageKey: null })
      existing = productBySku.get(sku)
      createdCount++
    }

    if (!stockedProductIds.has(productId)) {
      const quantity = 10 + (stableNumber(source.code) % 41)
      await receiveStock.execute(
        { productId, quantity, note: 'สินค้าสาธิตจาก Open Food Facts' },
        actor,
        branchId,
      )
      stockedProductIds.add(productId)
    }

    if (!existing?.imageKey) {
      const image = Bun.file(new URL(`./demo-product-images/${source.localImage}`, import.meta.url))
      if (!(await image.exists())) throw new Error(`Missing demo product image: ${source.localImage}`)
      const updated = await setProductImage.execute(productId, image, branchId)
      existing!.imageKey = updated.imageKey
      imageCount++
    }

    if ((index + 1) % 50 === 0) {
      console.log(`Demo catalog progress: ${index + 1}/${manifest.length}`)
    }
  }

  console.log(
    `Demo catalog complete: ${createdCount} products created, ${imageCount} images attached, ${existingCount} products already existed`,
  )
}
