import { CategoryEntity, type CategoryEntityProps } from '../domains/category.domain'
import { ProductEntity, type ProductEntityProps } from '../domains/product.domain'
import { SaleEntity, type SaleEntityProps } from '../domains/sale.domain'
import { StockMovementEntity, type StockMovementEntityProps } from '../domains/stock-movement.domain'
import { UserEntity, type UserEntityProps } from '../domains/user.domain'

export const makeCategory = (overrides: Partial<CategoryEntityProps> = {}) =>
  new CategoryEntity({ id: 1, name: 'เครื่องดื่ม', sortOrder: 0, isActive: true, ...overrides })

export const makeUser = (overrides: Partial<UserEntityProps> = {}) =>
  new UserEntity({ id: 1, username: 'somchai', displayName: 'สมชาย', role: 'cashier', isActive: true, ...overrides })

export const makeProduct = (overrides: Partial<ProductEntityProps> = {}) =>
  new ProductEntity({
    id: 1,
    sku: 'SKU-1',
    barcode: null,
    name: 'น้ำดื่ม',
    categoryId: null,
    priceSatang: 1000,
    costSatang: 600,
    trackStock: true,
    stockQty: 10,
    isActive: true,
    imageKey: null,
    ...overrides,
  })

export const makeStockMovement = (overrides: Partial<StockMovementEntityProps> = {}) =>
  new StockMovementEntity({
    id: 1,
    productId: 1,
    type: 'receive',
    quantity: 10,
    balanceAfter: 10,
    reference: null,
    note: null,
    userId: 1,
    createdAt: new Date('2026-10-13T06:00:00Z'),
    ...overrides,
  })

/** A completed sale of 3 x 10.00 paid with 50.00 cash. */
export const makeSale = (overrides: Partial<SaleEntityProps> = {}) =>
  new SaleEntity({
    id: 1,
    receiptNo: '20261013-00001',
    status: 'completed',
    subtotalSatang: 3000,
    discountSatang: 0,
    totalSatang: 3000,
    vatSatang: 196,
    paidSatang: 5000,
    changeSatang: 2000,
    cashierId: 1,
    cashierName: 'สมชาย',
    voidedById: null,
    voidedAt: null,
    voidReason: null,
    createdAt: new Date('2026-10-13T06:00:00Z'),
    items: [
      {
        productId: 1,
        productName: 'น้ำดื่ม',
        sku: 'SKU-1',
        unitPriceSatang: 1000,
        unitCostSatang: 600,
        quantity: 3,
        lineTotalSatang: 3000,
      },
    ],
    payments: [{ method: 'cash', amountSatang: 5000 }],
    ...overrides,
  })
