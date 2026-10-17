// Type-only entry point for clients (the web app imports these alongside the Eden `App` type).
export type { SalesReportResponse as SalesReport, ReportProductResponse as ReportProduct, ReportBranchResponse as ReportBranch } from './modules/sales/adapters/controllers/schemas/sales-report.schema'
export type { UserResponse as User } from './modules/users/adapters/controllers/schemas/user.schema'
export type { BranchResponse as Branch } from './modules/branches/adapters/controllers/schemas/branch.schema'
export type { SettingsResponse as ShopSettings } from './modules/settings/adapters/controllers/schemas/settings.schema'
export type { CategoryResponse as Category } from './modules/categories/adapters/controllers/schemas/category.schema'
export type { ProductResponse as Product } from './modules/products/adapters/controllers/schemas/product.schema'
export type { OrderResponse as Order } from './modules/orders/adapters/controllers/schemas/order.schema'
export type { StockMovementResponse as StockMovement } from './modules/inventory/adapters/controllers/schemas/inventory.schema'
export type {
  SaleHeaderResponse as SaleHeader,
  SaleResponse as Sale,
  SaleSummaryResponse as SaleSummary,
} from './modules/sales/adapters/controllers/schemas/sale.schema'
export type {
  ModifierGroupResponse as ModifierGroup,
  ModifierOptionResponse as ModifierOption,
} from './modules/modifiers/adapters/controllers/schemas/modifier.schema'
export type { TableResponse as DiningTable } from './modules/tables/adapters/controllers/schemas/table.schema'
export type {
  KitchenBoardTicketResponse as KitchenBoardTicket,
  KitchenStationResponse as KitchenStation,
} from './modules/kitchen/adapters/controllers/schemas/kitchen.schema'

export type { MemberResponse as Member } from './modules/members/adapters/controllers/schemas/member.schema'
