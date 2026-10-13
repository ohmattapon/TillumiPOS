import 'reflect-metadata'
import { count } from 'drizzle-orm'
import { container } from 'tsyringe'
import { CreateCategoryUseCase } from '../../modules/categories/applications/usecases/create-category.usecase'
import '../../modules/di-registrations'
import { ProductsService } from '../../modules/catalog/products/service'
import { InventoryService } from '../../modules/inventory/service'
import { users } from '../../modules/users/schema'
import { UsersService } from '../../modules/users/service'
import { client, db } from '../../libs/db'

const [existing] = await db.select({ total: count() }).from(users)
if (existing!.total > 0) {
  console.log('Database already has users, skipping seed')
} else {
  const password = Bun.env.SEED_OWNER_PASSWORD ?? 'admin1234'
  const owner = await UsersService.create({ username: 'admin', password, displayName: 'เจ้าของร้าน', role: 'owner' })

  const createCategory = container.resolve(CreateCategoryUseCase)
  const drinks = await createCategory.execute({ name: 'เครื่องดื่ม', sortOrder: 1 })
  const snacks = await createCategory.execute({ name: 'ขนม', sortOrder: 2 })

  const samples = [
    { sku: 'DRK-001', barcode: '8850000000011', name: 'น้ำดื่ม 600 มล.', categoryId: drinks.id, priceSatang: 1000, costSatang: 600 },
    { sku: 'DRK-002', barcode: '8850000000028', name: 'กาแฟกระป๋อง', categoryId: drinks.id, priceSatang: 1500, costSatang: 1050 },
    { sku: 'SNK-001', barcode: '8850000000035', name: 'มันฝรั่งทอด', categoryId: snacks.id, priceSatang: 2000, costSatang: 1400 },
    { sku: 'SNK-002', barcode: '8850000000042', name: 'ช็อกโกแลตแท่ง', categoryId: snacks.id, priceSatang: 2500, costSatang: 1800 },
  ]
  for (const sample of samples) {
    const product = await ProductsService.create(sample)
    await InventoryService.receive({ productId: product.id, quantity: 50, note: 'ยอดยกมา' }, owner.id)
  }

  console.log(`Seeded owner "admin" (password: ${password}) and ${samples.length} sample products`)
}

await client.close()
