import { Elysia } from 'elysia'
import { MemberElysiaController } from './members/adapters/controllers/member.controller'
import { container } from 'tsyringe'
import { AuthElysiaController } from './auth/adapters/controllers/auth.controller'
import { BranchElysiaController } from './branches/adapters/controllers/branch.controller'
import { CategoryElysiaController } from './categories/adapters/controllers/category.controller'
import './di-registrations'
import { InventoryElysiaController } from './inventory/adapters/controllers/inventory.controller'
import { KitchenCatalogElysiaController } from './kitchen/adapters/controllers/kitchen-catalog.controller'
import { KitchenTicketElysiaController } from './kitchen/adapters/controllers/kitchen-ticket.controller'
import { ModifierElysiaController } from './modifiers/adapters/controllers/modifier.controller'
import { OrderElysiaController } from './orders/adapters/controllers/order.controller'
import { QrPaymentElysiaController } from './qr-payments/adapters/controllers/qr-payment.controller'
import { ProductElysiaController } from './products/adapters/controllers/product.controller'
import { PromotionElysiaController } from './promotions/adapters/controllers/promotion.controller'
import { QuoteElysiaController } from './quotes/adapters/controllers/quote.controller'
import { SaleElysiaController } from './sales/adapters/controllers/sale.controller'
import { SalesReportElysiaController } from './sales/adapters/controllers/sales-report.controller'
import { SettingsElysiaController } from './settings/adapters/controllers/settings.controller'
import { SetupElysiaController } from './setup/adapters/controllers/setup.controller'
import { TableElysiaController } from './tables/adapters/controllers/table.controller'
import { UserElysiaController } from './users/adapters/controllers/user.controller'

const authController = container.resolve(AuthElysiaController)
const userController = container.resolve(UserElysiaController)
const branchController = container.resolve(BranchElysiaController)
const categoryController = container.resolve(CategoryElysiaController)
const productController = container.resolve(ProductElysiaController)
const modifierController = container.resolve(ModifierElysiaController)
const tableController = container.resolve(TableElysiaController)
const kitchenCatalogController = container.resolve(KitchenCatalogElysiaController)
const inventoryController = container.resolve(InventoryElysiaController)
const saleController = container.resolve(SaleElysiaController)
const orderController = container.resolve(OrderElysiaController)
const kitchenTicketController = container.resolve(KitchenTicketElysiaController)
const qrPaymentController = container.resolve(QrPaymentElysiaController)
const settingsController = container.resolve(SettingsElysiaController)
const setupController = container.resolve(SetupElysiaController)

// Categories and products are separate modules that share the /catalog namespace.
const catalog = new Elysia({ name: 'catalog', prefix: '/catalog', detail: { tags: ['Catalog'] } })
  .use(categoryController.getRoutes())
  .use(productController.getRoutes())
  .use(modifierController.getRoutes())
  .use(tableController.getRoutes())
  .use(kitchenCatalogController.getRoutes())

// Chained in one expression on purpose: the Eden client's types come from the type of this value.
export const appModule = new Elysia({ name: 'api', prefix: '/api/v1' })
  .get('/health', () => ({ status: 'ok' }), { detail: { tags: ['System'], summary: 'ตรวจสอบสถานะระบบ' } })
  .use(authController.getRoutes())
  .use(setupController.getRoutes())
  .use(userController.getRoutes())
  .use(branchController.getRoutes())
  .use(catalog)
  .use(container.resolve(MemberElysiaController).getRoutes())
  .use(container.resolve(PromotionElysiaController).getRoutes())
  .use(container.resolve(QuoteElysiaController).getRoutes())
  .use(inventoryController.getRoutes())
  .use(saleController.getRoutes())
  .use(container.resolve(SalesReportElysiaController).getRoutes())
  .use(orderController.getRoutes())
  .use(kitchenTicketController.getRoutes())
  .use(qrPaymentController.getRoutes())
  .use(settingsController.getRoutes())
