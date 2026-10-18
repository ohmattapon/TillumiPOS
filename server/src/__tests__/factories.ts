import { BranchEntity, type BranchEntityProps } from '../domains/branch.domain'
import { PriceQuoteEntity, type PriceQuoteProps } from '../domains/price-quote.domain'
import { DiningTableEntity, type DiningTableProps } from '../domains/dining-table.domain'
import {
  ModifierGroupEntity,
  ModifierOptionEntity,
  type ModifierGroupProps,
  type ModifierOptionProps,
} from '../domains/modifier.domain'
import { OrderEntity, type OrderEntityProps } from '../domains/order.domain'
import { QrPaymentEntity, type QrPaymentEntityProps } from '../domains/qr-payment.domain'
import { CategoryEntity, type CategoryEntityProps } from '../domains/category.domain'
import { ProductEntity, type ProductEntityProps } from '../domains/product.domain'
import { SaleEntity, type SaleEntityProps } from '../domains/sale.domain'
import { SlideEntity, type SlideEntityProps } from '../domains/slide.domain'
import { StockMovementEntity, type StockMovementEntityProps } from '../domains/stock-movement.domain'
import { UserEntity, type UserEntityProps } from '../domains/user.domain'

export const makeCategory = (overrides: Partial<CategoryEntityProps> = {}) =>
  new CategoryEntity({ id: 1, name: 'เครื่องดื่ม', sortOrder: 0, isActive: true, ...overrides })

export const makeSlide = (overrides: Partial<SlideEntityProps> = {}) =>
  new SlideEntity({
    id: 1,
    imageKey: 'slides/550e8400-e29b-41d4-a716-446655440000.png',
    sortOrder: 0,
    isActive: true,
    ...overrides,
  })

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
    tableId: null,
    status: 'open',
    openedById: 1,
    openedByName: 'สมชาย',
    saleId: null,
    cancelReason: null,
    cancelledById: null,
    mergedIntoId: null,
    createdAt: new Date('2026-10-13T06:00:00Z'),
    updatedAt: new Date('2026-10-13T06:00:00Z'),
    items: [{ lineId: 1, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 2, options: [], note: null }],
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
    shopName: 'TillumiPOS',
    shopTaxId: null,
    branchName: 'สาขาหลัก',
    shopAddress: null,
    shopPhone: null,
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
        options: [],
      },
    ],
    payments: [{ method: 'cash', amountSatang: 5000 }],
    ...overrides,
  })

export const makeModifierGroup = (overrides: Partial<ModifierGroupProps> = {}) =>
  new ModifierGroupEntity({ id: 1, name: 'ระดับความหวาน', required: true, maxSelections: 1, sortOrder: 0, isActive: true, ...overrides })

export const makeModifierOption = (overrides: Partial<ModifierOptionProps> = {}) =>
  new ModifierOptionEntity({ id: 10, groupId: 1, name: 'หวานน้อย', priceSatang: 0, costSatang: 0, sortOrder: 0, isActive: true, ...overrides })

export const makeTable = (overrides: Partial<DiningTableProps> = {}) =>
  new DiningTableEntity({
    id: 1,
    branchId: 1,
    name: 'T1',
    zone: null,
    seats: 4,
    x: 20,
    y: 20,
    width: 120,
    height: 80,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  })

/** An open quote for 3 x 10.00 made at 12:00 on 2026-10-15 (Bangkok), good for 15 minutes. */
export const makePriceQuote = (overrides: Partial<PriceQuoteProps> = {}) =>
  new PriceQuoteEntity({
    id: 5,
    branchId: 1,
    memberId: null,
    member: null,
    orderId: null,
    lines: [{ productId: 1, productName: 'น้ำดื่ม', sku: 'SKU-1', unitPriceSatang: 1000, quantity: 3, options: [] }],
    promotion: null,
    vatMode: 'inclusive',
    vatRateBp: 700,
    subtotalSatang: 3000,
    discountSatang: 0,
    vatSatang: 196,
    totalSatang: 3000,
    status: 'open',
    qrReference: null,
    saleId: null,
    createdById: 1,
    expiresAt: new Date('2026-10-15T05:15:00Z'),
    createdAt: new Date('2026-10-15T05:00:00Z'),
    ...overrides,
  })
