import { BranchEntity, type BranchEntityProps } from '../domains/branch.domain'
import { OrderEntity, type OrderEntityProps } from '../domains/order.domain'
import { QrPaymentEntity, type QrPaymentEntityProps } from '../domains/qr-payment.domain'
import { CategoryEntity, type CategoryEntityProps } from '../domains/category.domain'
import { ProductEntity, type ProductEntityProps } from '../domains/product.domain'
import { SaleEntity, type SaleEntityProps } from '../domains/sale.domain'
import { StockMovementEntity, type StockMovementEntityProps } from '../domains/stock-movement.domain'
import { UserEntity, type UserEntityProps } from '../domains/user.domain'

export const makeCategory = (overrides: Partial<CategoryEntityProps> = {}) =>
  new CategoryEntity({ id: 1, name: 'เครื่องดื่ม', sortOrder: 0, isActive: true, ...overrides })

export const makeBranch = (overrides: Partial<BranchEntityProps> = {}) =>
  new BranchEntity({ id: 1, code: 'MAIN', name: 'สาขาหลัก', address: null, phone: null, isActive: true, ...overrides })

export const makeUser = (overrides: Partial<UserEntityProps> = {}) =>
  new UserEntity({
    id: 1,
    username: 'somchai',
    displayName: 'สมชาย',
    role: 'cashier',
    branchId: 1,
    isActive: true,
    ...overrides,
  })

/** A pending QR for 50.00 that expires 10 minutes after it was made. */
export const makeQrPayment = (overrides: Partial<QrPaymentEntityProps> = {}) =>
  new QrPaymentEntity({
    id: 1,
    branchId: 1,
    reference: 'QR0123456789ABCD',
    amountSatang: 5000,
    qrRawData: '000201010212',
    expiresAt: new Date('2026-10-13T06:10:00Z'),
    createdById: 1,
    status: 'pending',
    bankTransactionId: null,
    payerName: null,
    paidAt: null,
    lastCheckedAt: null,
    saleId: null,
    originShiftId: null,
    dismissedAt: null,
    dismissedById: null,
    dismissReason: null,
    createdAt: new Date('2026-10-13T06:00:00Z'),
    ...overrides,
  })

/** An open order with one line of 2 x 25.00. */
export const makeOrder = (overrides: Partial<OrderEntityProps> = {}) =>
  new OrderEntity({
    id: 1,
    branchId: 1,
    label: 'โต๊ะ 4',
    status: 'open',
    openedById: 1,
    openedByName: 'สมชาย',
    saleId: null,
    cancelReason: null,
    cancelledById: null,
    createdAt: new Date('2026-10-13T06:00:00Z'),
    updatedAt: new Date('2026-10-13T06:00:00Z'),
    items: [{ productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 2 }],
    ...overrides,
  })

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
    branchId: 1,
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
    receiptNo: 'MAIN-20261013-00001',
    branchId: 1,
    status: 'completed',
    subtotalSatang: 3000,
    discountSatang: 0,
    totalSatang: 3000,
    vatSatang: 196,
    paidSatang: 5000,
    changeSatang: 2000,
    vatMode: 'inclusive',
    vatRateBp: 700,
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
