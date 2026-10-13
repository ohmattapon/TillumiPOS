// Type-only entry point for clients (the web app imports these alongside the Eden `App` type).
export type { User } from './modules/users/model'
export type { Category } from './modules/catalog/categories/model'
export type { Product } from './modules/catalog/products/model'
export type { StockMovement } from './modules/inventory/model'
export type { Sale, SaleHeader, SaleSummary } from './modules/sales/model'
