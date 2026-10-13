// Tables move here module by module during the hexagonal migration; the rest still live with their module.
export * from './categories'
export * from './products'
export * from './users'
export * from '../../../modules/inventory/schema'
export * from '../../../modules/sales/schema'
