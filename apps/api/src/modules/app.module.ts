import { Elysia } from 'elysia'
import { container } from 'tsyringe'
import { AuthElysiaController } from './auth/adapters/controllers/auth.controller'
import { CategoryElysiaController } from './categories/adapters/controllers/category.controller'
import './di-registrations'
import { InventoryElysiaController } from './inventory/adapters/controllers/inventory.controller'
import { ProductElysiaController } from './products/adapters/controllers/product.controller'
import { SaleElysiaController } from './sales/adapters/controllers/sale.controller'
import { UserElysiaController } from './users/adapters/controllers/user.controller'

const authController = container.resolve(AuthElysiaController)
const userController = container.resolve(UserElysiaController)
const categoryController = container.resolve(CategoryElysiaController)
const productController = container.resolve(ProductElysiaController)
const inventoryController = container.resolve(InventoryElysiaController)
const saleController = container.resolve(SaleElysiaController)

// Categories and products are separate modules that share the /catalog namespace.
const catalog = new Elysia({ name: 'catalog', prefix: '/catalog', detail: { tags: ['Catalog'] } })
  .use(categoryController.getRoutes())
  .use(productController.getRoutes())

// Chained in one expression on purpose: the Eden client's types come from the type of this value.
export const appModule = new Elysia({ name: 'api', prefix: '/api/v1' })
  .get('/health', () => ({ status: 'ok' }), { detail: { tags: ['System'], summary: 'ตรวจสอบสถานะระบบ' } })
  .use(authController.getRoutes())
  .use(userController.getRoutes())
  .use(catalog)
  .use(inventoryController.getRoutes())
  .use(saleController.getRoutes())
