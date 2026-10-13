// Type-only entry point for clients (the web app imports these alongside the Eden `App` type).
export type { UserResponse as User } from './modules/users/adapters/controllers/schemas/user.schema'
export type { CategoryResponse as Category } from './modules/categories/adapters/controllers/schemas/category.schema'
export type { Product } from './modules/catalog/products/model'
export type { StockMovement } from './modules/inventory/model'
export type { Sale, SaleHeader, SaleSummary } from './modules/sales/model'
