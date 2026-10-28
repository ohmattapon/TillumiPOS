import 'reflect-metadata'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { container } from 'tsyringe'
import '../../modules/di-registrations'
import { branches } from './schema/branches'
import { categories as productCategories } from './schema/categories'
import { products } from './schema/products'
import { users } from './schema/users'
import { db, client } from '../../libs/db'
import { CreateCategoryUseCase } from '../../modules/categories/applications/usecases/create-category.usecase'
import { CreateProductUseCase } from '../../modules/products/applications/usecases/create-product.usecase'
import { ReceiveStockUseCase } from '../../modules/inventory/applications/usecases/receive-stock.usecase'

// Demo products that are sold and received in packs (ลัง), so the pack screens have data to work with.
// `packs[].priceSatang: null` means the pack sells for size × the product price.

type MockPack = { size: number; priceSatang: number | null }

type MockProduct = {
  sku: string
  name: string
  barcode: string
  category: string
  priceSatang: number
  costSatang: number
  packs: MockPack[]
  /** Stock arrives in this pack, so the receipt note shows the carton it came in. */
  receive: { packSize: number; count: number }
}

const categoryNames = ['เครื่องดื่ม', 'ขนม', 'อาหารแห้ง', 'ของใช้ในบ้าน'] as const

const mockProducts: MockProduct[] = [
  { sku: 'PACK-01', name: 'น้ำดื่มสิงห์ 600 มล.', barcode: '8859001000011', category: 'เครื่องดื่ม', priceSatang: 700, costSatang: 500, packs: [{ size: 12, priceSatang: null }, { size: 24, priceSatang: null }], receive: { packSize: 12, count: 10 } },
  { sku: 'PACK-02', name: 'น้ำดื่มคริสตัล 600 มล.', barcode: '8859001000028', category: 'เครื่องดื่ม', priceSatang: 600, costSatang: 400, packs: [{ size: 12, priceSatang: 6500 }, { size: 24, priceSatang: 12800 }], receive: { packSize: 12, count: 10 } },
  { sku: 'PACK-03', name: 'โค้ก 325 มล.', barcode: '8859001000035', category: 'เครื่องดื่ม', priceSatang: 1500, costSatang: 1100, packs: [{ size: 24, priceSatang: 34000 }], receive: { packSize: 24, count: 5 } },
  { sku: 'PACK-04', name: 'เป๊ปซี่ 325 มล.', barcode: '8859001000042', category: 'เครื่องดื่ม', priceSatang: 1500, costSatang: 1100, packs: [{ size: 24, priceSatang: null }], receive: { packSize: 24, count: 5 } },
  { sku: 'PACK-05', name: 'ช้างคลาสสิค 330 มล.', barcode: '8859001000059', category: 'เครื่องดื่ม', priceSatang: 3200, costSatang: 2500, packs: [{ size: 24, priceSatang: null }], receive: { packSize: 24, count: 3 } },
  { sku: 'PACK-06', name: 'ลีโอ 330 มล.', barcode: '8859001000066', category: 'เครื่องดื่ม', priceSatang: 3300, costSatang: 2600, packs: [{ size: 24, priceSatang: 78000 }], receive: { packSize: 24, count: 3 } },
  { sku: 'PACK-07', name: 'น้ำส้มทิปโก้ 200 มล.', barcode: '8859001000073', category: 'เครื่องดื่ม', priceSatang: 1200, costSatang: 900, packs: [{ size: 24, priceSatang: null }, { size: 48, priceSatang: 27000 }], receive: { packSize: 24, count: 4 } },
  { sku: 'PACK-08', name: 'นมไทย-เดนมาร์ค 180 มล.', barcode: '8859001000080', category: 'เครื่องดื่ม', priceSatang: 1300, costSatang: 1000, packs: [{ size: 12, priceSatang: 15000 }, { size: 48, priceSatang: 58000 }], receive: { packSize: 12, count: 6 } },
  { sku: 'PACK-09', name: 'มาม่าคัพ ครีมชีส', barcode: '8859001000097', category: 'อาหารแห้ง', priceSatang: 2000, costSatang: 1500, packs: [{ size: 12, priceSatang: 22500 }], receive: { packSize: 12, count: 5 } },
  { sku: 'PACK-10', name: 'บะหมี่กึ่งสำเร็จรูป ต้มยำกุ้ง', barcode: '8859001000103', category: 'อาหารแห้ง', priceSatang: 800, costSatang: 600, packs: [{ size: 30, priceSatang: 22500 }, { size: 60, priceSatang: 44000 }], receive: { packSize: 30, count: 4 } },
  { sku: 'PACK-11', name: 'เลย์ รสออริจินัล 55 ก.', barcode: '8859001000110', category: 'ขนม', priceSatang: 2500, costSatang: 1900, packs: [{ size: 12, priceSatang: null }], receive: { packSize: 12, count: 5 } },
  { sku: 'PACK-12', name: 'โอรีโอ 64.5 ก.', barcode: '8859001000127', category: 'ขนม', priceSatang: 2000, costSatang: 1500, packs: [{ size: 24, priceSatang: null }], receive: { packSize: 24, count: 3 } },
  { sku: 'PACK-13', name: 'ยาสีฟันคอลเกต 150 ก.', barcode: '8859001000134', category: 'ของใช้ในบ้าน', priceSatang: 4500, costSatang: 3500, packs: [{ size: 12, priceSatang: 51000 }], receive: { packSize: 12, count: 3 } },
  { sku: 'PACK-14', name: 'สบู่ลักส์ 85 ก.', barcode: '8859001000141', category: 'ของใช้ในบ้าน', priceSatang: 2200, costSatang: 1600, packs: [{ size: 36, priceSatang: 76000 }], receive: { packSize: 36, count: 2 } },
  { sku: 'PACK-15', name: 'ผงซักฟอกบรีส 800 ก.', barcode: '8859001000158', category: 'ของใช้ในบ้าน', priceSatang: 6500, costSatang: 5200, packs: [{ size: 12, priceSatang: null }], receive: { packSize: 12, count: 2 } },
  { sku: 'PACK-16', name: 'ทิชชู่ม้วน เซลล็อกซ์', barcode: '8859001000165', category: 'ของใช้ในบ้าน', priceSatang: 1200, costSatang: 900, packs: [{ size: 24, priceSatang: 27500 }], receive: { packSize: 24, count: 3 } },
  { sku: 'PACK-17', name: 'น้ำปลาตราทิพรส 300 มล.', barcode: '8859001000172', category: 'อาหารแห้ง', priceSatang: 3200, costSatang: 2500, packs: [{ size: 12, priceSatang: 37000 }], receive: { packSize: 12, count: 2 } },
  { sku: 'PACK-18', name: 'ซอสหอยนางรม แม่ครัว 300 มล.', barcode: '8859001000189', category: 'อาหารแห้ง', priceSatang: 3000, costSatang: 2300, packs: [{ size: 12, priceSatang: 34500 }], receive: { packSize: 12, count: 2 } },
  { sku: 'PACK-19', name: 'ข้าวสารหอมมะลิ 5 กก.', barcode: '8859001000196', category: 'อาหารแห้ง', priceSatang: 18500, costSatang: 16000, packs: [{ size: 4, priceSatang: 72000 }], receive: { packSize: 4, count: 5 } },
  { sku: 'PACK-20', name: 'น้ำมันพืชมรกต 1 ล.', barcode: '8859001000202', category: 'อาหารแห้ง', priceSatang: 6200, costSatang: 5100, packs: [{ size: 12, priceSatang: 73000 }], receive: { packSize: 12, count: 2 } },
]

// A pack barcode never repeats a product barcode and never leaks into another product.
function packBarcode(barcode: string, size: number): string {
  return `${barcode}-${size}`
}

async function packSeed() {
  const [owner] = await db
    .select({ id: users.id, displayName: users.displayName, branchId: users.branchId })
    .from(users)
    .innerJoin(branches, eq(users.branchId, branches.id))
    .where(and(eq(users.role, 'owner'), eq(users.isActive, true), eq(branches.isActive, true)))
    .orderBy(asc(users.id))
    .limit(1)
  if (!owner) throw new Error('Create or set up an owner account before seeding the pack demo')

  const actor = { id: owner.id, displayName: owner.displayName }
  const createCategory = container.resolve(CreateCategoryUseCase)
  const createProduct = container.resolve(CreateProductUseCase)
  const receiveStock = container.resolve(ReceiveStockUseCase)

  const existingCategories = await db
    .select({ id: productCategories.id, name: productCategories.name })
    .from(productCategories)
  const categoryIds = new Map(existingCategories.map((category) => [category.name, category.id]))
  for (const [sortOrder, name] of categoryNames.entries()) {
    if (!categoryIds.has(name)) {
      const created = await createCategory.execute({ name, sortOrder: sortOrder + 10 })
      categoryIds.set(name, created.id)
    }
  }

  const existingProducts = await db
    .select({ sku: products.sku })
    .from(products)
    .where(inArray(products.sku, mockProducts.map((product) => product.sku)))
  const existingSkus = new Set(existingProducts.map((product) => product.sku))

  let createdCount = 0
  let skippedCount = 0
  for (const mock of mockProducts) {
    if (existingSkus.has(mock.sku)) {
      skippedCount++
      continue
    }
    const categoryId = categoryIds.get(mock.category)
    if (!categoryId) throw new Error(`Category not found: ${mock.category}`)

    const product = await createProduct.execute(
      {
        sku: mock.sku,
        barcode: mock.barcode,
        name: mock.name,
        categoryId,
        priceSatang: mock.priceSatang,
        costSatang: mock.costSatang,
        trackStock: true,
        packs: mock.packs.map((pack) => ({
          barcode: packBarcode(mock.barcode, pack.size),
          size: pack.size,
          priceSatang: pack.priceSatang,
        })),
      },
      owner.branchId,
      actor,
    )

    const carton = product.packs.find((pack) => pack.size === mock.receive.packSize)
    if (!carton) throw new Error(`${mock.name} has no pack of ${mock.receive.packSize}`)
    await receiveStock.execute(
      { productId: product.id, packId: carton.id, quantity: mock.receive.count, note: 'สต็อกตัวอย่าง' },
      actor,
      owner.branchId,
    )
    createdCount++
  }

  console.log(`Pack demo seeded: ${createdCount} products created, ${skippedCount} already existed`)
}

try {
  await packSeed()
} finally {
  await client.close()
}
