import { Elysia } from 'elysia'
import { container } from 'tsyringe'
import { AuthElysiaController } from './auth/adapters/controllers/auth.controller'
import { BranchElysiaController } from './branches/adapters/controllers/branch.controller'
import { CategoryElysiaController } from './categories/adapters/controllers/category.controller'
import './di-registrations'
import { InventoryElysiaController } from './inventory/adapters/controllers/inventory.controller'
import { ProductElysiaController } from './products/adapters/controllers/product.controller'
import { SaleElysiaController } from './sales/adapters/controllers/sale.controller'
import { SettingsElysiaController } from './settings/adapters/controllers/settings.controller'
import { UserElysiaController } from './users/adapters/controllers/user.controller'

const authController = container.resolve(AuthElysiaController)
const userController = container.resolve(UserElysiaController)
const branchController = container.resolve(BranchElysiaController)
const categoryController = container.resolve(CategoryElysiaController)
const productController = container.resolve(ProductElysiaController)
const inventoryController = container.resolve(InventoryElysiaController)
const saleController = container.resolve(SaleElysiaController)
const settingsController = container.resolve(SettingsElysiaController)

// Categories and products are separate modules that share the /catalog namespace.
const catalog = new Elysia({ name: 'catalog', prefix: '/catalog', detail: { tags: ['Catalog'] } })
  .use(categoryController.getRoutes())
  .use(productController.getRoutes())

// Chained in one expression on purpose: the Eden client's types come from the type of this value.
export const appModule = new Elysia({ name: 'api', prefix: '/api/v1' })
  .get('/health', () => ({ status: 'ok' }), { detail: { tags: ['System'], summary: 'ตรวจสอบสถานะระบบ' } })
  .use(authController.getRoutes())
  .use(userController.getRoutes())
  .use(branchController.getRoutes())
  .use(catalog)
  .use(inventoryController.getRoutes())
  .use(saleController.getRoutes())
  .use(settingsController.getRoutes())
