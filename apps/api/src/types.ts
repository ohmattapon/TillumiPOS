// Type-only entry point for clients (the web app imports these alongside the Eden `App` type).
export type { UserResponse as User } from './modules/users/adapters/controllers/schemas/user.schema'
export type { BranchResponse as Branch } from './modules/branches/adapters/controllers/schemas/branch.schema'
export type { SettingsResponse as ShopSettings } from './modules/settings/adapters/controllers/schemas/settings.schema'
export type { CategoryResponse as Category } from './modules/categories/adapters/controllers/schemas/category.schema'
export type { ProductResponse as Product } from './modules/products/adapters/controllers/schemas/product.schema'
export type { StockMovementResponse as StockMovement } from './modules/inventory/adapters/controllers/schemas/inventory.schema'
export type {
  SaleHeaderResponse as SaleHeader,
  SaleResponse as Sale,
  SaleSummaryResponse as SaleSummary,
} from './modules/sales/adapters/controllers/schemas/sale.schema'
