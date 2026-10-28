import type { IQuoteProducts } from '../modules/quotes/applications/ports/quote-products.port'
import type { IAuditLog } from '../modules/audit/applications/ports/audit-log.port'
import { mock, type Mock } from 'bun:test'
import type { IRoleRepository } from '../modules/roles/applications/ports/role.repository'
export const mockRoleRepository = (): Mocked<IRoleRepository> => ({
  findAll: mock<IRoleRepository['findAll']>(),
  findById: mock<IRoleRepository['findById']>(),
  findByIdForUpdate: mock<IRoleRepository['findByIdForUpdate']>(),
  create: mock<IRoleRepository['create']>(),
  update: mock<IRoleRepository['update']>(),
  delete: mock<IRoleRepository['delete']>(),
})
import type { ISalesReportRepository } from '../modules/sales/applications/ports/sales-report.repository'

export const mockSalesReportRepository = (): Mocked<ISalesReportRepository> => ({
  overview: mock<ISalesReportRepository['overview']>(),
  products: mock<ISalesReportRepository['products']>(),
  branches: mock<ISalesReportRepository['branches']>(),
})
import type { IBranchRepository } from '../modules/branches/applications/ports/branch.repository'
import type { ICategoryRepository } from '../modules/categories/applications/ports/category.repository'
import type { IStockLedger } from '../modules/inventory/applications/ports/stock-ledger.port'
import type { IStockMovementRepository } from '../modules/inventory/applications/ports/stock-movement.repository'
import type { ILineOptionsResolver } from '../modules/modifiers/applications/ports/line-options-resolver.port'
import type { IStarterOptionGroups } from '../modules/setup/applications/ports/starter-option-groups.port'
import type { IModifierRepository } from '../modules/modifiers/applications/ports/modifier.repository'
import type { IOrderRepository } from '../modules/orders/applications/ports/order.repository'
import type { IFirstRunGuard } from '../modules/setup/applications/ports/first-run-guard.port'
import type { ISetupCode } from '../modules/setup/applications/ports/setup-code.port'
import type { ITableOccupancy } from '../modules/tables/applications/ports/table-occupancy.port'
import type { ITableRepository } from '../modules/tables/applications/ports/table.repository'
import type { IQrPaymentGateway } from '../modules/qr-payments/applications/ports/qr-payment-gateway.port'
import type { IQrPaymentRepository } from '../modules/qr-payments/applications/ports/qr-payment.repository'
import type { IQrPaymentClaims } from '../modules/qr-payments/applications/ports/qr-payment-claims.port'
import type { ISaleCheckout } from '../modules/sales/applications/ports/sale-checkout.port'
import type { IProductRepository } from '../modules/products/applications/ports/product.repository'
import type { IShopSettingsRepository } from '../modules/settings/applications/ports/shop-settings.repository'
import type { ICheckoutPolicy } from '../modules/shared/ports/checkout-policy.port'
import type { IShiftLedger } from '../modules/shared/ports/shift-ledger.port'
import type { IShiftSettingsGuard } from '../modules/shifts/applications/ports/shift-settings-guard.port'
import type { IShiftRepository } from '../modules/shifts/applications/ports/shift.repository'
import type { IRegisterRepository } from '../modules/shifts/applications/ports/register.repository'
import type { ISaleRepository } from '../modules/sales/applications/ports/sale.repository'
import type { IMediaStorage } from '../modules/shared/ports/media-storage.port'
import type { IPasswordHasher } from '../modules/shared/ports/password-hasher.port'
import type { IUnitOfWork } from '../modules/shared/ports/unit-of-work.port'
import type { IRoleDirectory } from '../modules/users/applications/ports/role-directory.port'
import type { IUserRepository } from '../modules/users/applications/ports/user.repository'

/** A port whose every method is a bun mock with that method's signature. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches any method signature
type Mocked<T> = { [K in keyof T]: T[K] extends (...args: any[]) => any ? Mock<T[K]> : T[K] }

export const mockCategoryRepository = (): Mocked<ICategoryRepository> => ({
  findAll: mock<ICategoryRepository['findAll']>(),
  findById: mock<ICategoryRepository['findById']>(),
  create: mock<ICategoryRepository['create']>(),
  update: mock<ICategoryRepository['update']>(),
})

export const mockSlideRepository = (): Mocked<ISlideRepository> => ({
  findAll: mock<ISlideRepository['findAll']>(),
  findActive: mock<ISlideRepository['findActive']>(),
  findById: mock<ISlideRepository['findById']>(),
  create: mock<ISlideRepository['create']>(),
  update: mock<ISlideRepository['update']>(),
  delete: mock<ISlideRepository['delete']>(),
})

export const mockUserRepository = (): Mocked<IUserRepository> => ({
  lockOwnerChangesForUpdate: mock(async () => {}),
  findAll: mock<IUserRepository['findAll']>(),
  findById: mock<IUserRepository['findById']>(),
  findByIdForUpdate: mock<IUserRepository['findByIdForUpdate']>(),
  findActiveById: mock<IUserRepository['findActiveById']>(),
  findCredentialsByUsername: mock<IUserRepository['findCredentialsByUsername']>(),
  findPinHash: mock<IUserRepository['findPinHash']>(),
  setPinHash: mock<IUserRepository['setPinHash']>(),
  findSwitchable: mock<IUserRepository['findSwitchable']>(),
  findPasswordHashById: mock<IUserRepository['findPasswordHashById']>(),
  create: mock<IUserRepository['create']>(),
  update: mock<IUserRepository['update']>(),
  countActiveOwners: mock<IUserRepository['countActiveOwners']>(),
  countActiveInBranch: mock<IUserRepository['countActiveInBranch']>(),
})

/** Hashes are the plain text with a prefix, so tests can read what was stored. */
export const mockPasswordHasher = (): Mocked<IPasswordHasher> => ({
  hash: mock<IPasswordHasher['hash']>(async (plain) => `hashed:${plain}`),
  verify: mock<IPasswordHasher['verify']>(async (plain, hash) => hash === `hashed:${plain}`),
})

/** Runs the work immediately; transactional behaviour itself is covered by the integration test. */
export const mockUnitOfWork = () => {
  const run = mock((work: () => Promise<unknown>) => work())
  // `run` is generic in the port, which a mock cannot be; the cast keeps both the port type and the mock API.
  return { run } as unknown as IUnitOfWork & { run: typeof run }
}

export const mockProductRepository = (): Mocked<IProductRepository> => ({
  nextSkuNumber: mock<IProductRepository['nextSkuNumber']>(),
  skuExists: mock<IProductRepository['skuExists']>(),
  findAll: mock<IProductRepository['findAll']>(),
  findById: mock<IProductRepository['findById']>(),
  findManyForUpdate: mock<IProductRepository['findManyForUpdate']>(),
  create: mock<IProductRepository['create']>(),
  update: mock<IProductRepository['update']>(),
  adjustStock: mock<IProductRepository['adjustStock']>(),
  setImageKey: mock<IProductRepository['setImageKey']>(),
})

export const mockMediaStorage = (): Mocked<IMediaStorage> => ({
  isEnabled: mock<IMediaStorage['isEnabled']>(() => true),
  urlFor: mock<IMediaStorage['urlFor']>((key) => 'https://media.test/' + key),
  put: mock<IMediaStorage['put']>(async () => {}),
  delete: mock<IMediaStorage['delete']>(async () => {}),
})

export const mockStockMovementRepository = (): Mocked<IStockMovementRepository> => ({
  create: mock<IStockMovementRepository['create']>(),
  findAll: mock<IStockMovementRepository['findAll']>(),
})

export const mockStockLedger = (): Mocked<IStockLedger> => ({
  record: mock<IStockLedger['record']>(),
})

export const mockSaleRepository = (): Mocked<ISaleRepository> => ({
  nextReceiptNo: mock<ISaleRepository['nextReceiptNo']>(),
  create: mock<ISaleRepository['create']>(),
  findById: mock<ISaleRepository['findById']>(),
  findByIdForUpdate: mock<ISaleRepository['findByIdForUpdate']>(),
  saveVoid: mock<ISaleRepository['saveVoid']>(async () => {}),
  findHeaders: mock<ISaleRepository['findHeaders']>(),
  sumCompleted: mock<ISaleRepository['sumCompleted']>(),
})

export const mockBranchRepository = (): Mocked<IBranchRepository> => ({
  findAll: mock<IBranchRepository['findAll']>(),
  findById: mock<IBranchRepository['findById']>(),
  findMain: mock<IBranchRepository['findMain']>(),
  findByIdForUpdate: mock<IBranchRepository['findByIdForUpdate']>(),
  create: mock<IBranchRepository['create']>(),
  update: mock<IBranchRepository['update']>(),
  countActive: mock<IBranchRepository['countActive']>(),
})

export const mockQrPaymentRepository = (): Mocked<IQrPaymentRepository> => ({
  create: mock<IQrPaymentRepository['create']>(),
  findById: mock<IQrPaymentRepository['findById']>(),
  findByIdForUpdate: mock<IQrPaymentRepository['findByIdForUpdate']>(),
  findByReferenceForUpdate: mock<IQrPaymentRepository['findByReferenceForUpdate']>(),
  findByReference: mock<IQrPaymentRepository['findByReference']>(),
  findUnclaimed: mock<IQrPaymentRepository['findUnclaimed']>(),
  save: mock<IQrPaymentRepository['save']>(async (payment) => payment),
})

export const mockQrPaymentGateway = (): Mocked<IQrPaymentGateway> => ({
  isEnabled: mock<IQrPaymentGateway['isEnabled']>(() => true),
  createQr: mock<IQrPaymentGateway['createQr']>(),
  findPayment: mock<IQrPaymentGateway['findPayment']>(),
})

export const mockClock = (now: Date) => ({ now: mock(() => now) })

/** Hands out id-1, id-2, ... so a test knows the key an upload will get. */
export const mockIdGenerator = () => {
  let next = 0
  return { newId: mock(() => `id-${++next}`) }
}

export const mockQrPaymentClaims = (): Mocked<IQrPaymentClaims> => ({
  isRequired: mock<IQrPaymentClaims['isRequired']>(async () => false),
  assertClaimable: mock<IQrPaymentClaims['assertClaimable']>(async () => {}),
  consume: mock<IQrPaymentClaims['consume']>(async () => {}),
  reference: mock<IQrPaymentClaims['reference']>(async () => 'QR0123456789ABCD'),
})

export const mockOrderRepository = (): Mocked<IOrderRepository> => ({
  create: mock<IOrderRepository['create']>(),
  findById: mock<IOrderRepository['findById']>(),
  findByIdForUpdate: mock<IOrderRepository['findByIdForUpdate']>(),
  findAll: mock<IOrderRepository['findAll']>(),
  save: mock<IOrderRepository['save']>(),
})

export const mockSaleCheckout = (): Mocked<ISaleCheckout> => ({
  checkout: mock<ISaleCheckout['checkout']>(),
})

export const mockShopSettingsRepository = (): Mocked<IShopSettingsRepository> => ({
  get: mock<IShopSettingsRepository['get']>(),
  getForUpdate: mock<IShopSettingsRepository['getForUpdate']>(),
  save: mock<IShopSettingsRepository['save']>(),
})

export const mockRegisterRepository = (): Mocked<IRegisterRepository> => ({
  findAll: mock<IRegisterRepository['findAll']>(),
  findById: mock<IRegisterRepository['findById']>(),
  findByIdForUpdate: mock<IRegisterRepository['findByIdForUpdate']>(),
  create: mock<IRegisterRepository['create']>(),
  update: mock<IRegisterRepository['update']>(),
  hasOpenShift: mock<IRegisterRepository['hasOpenShift']>(),
  createMainForBranch: mock<IRegisterRepository['createMainForBranch']>(async () => {}),
})

export const mockCheckoutPolicy = (): Mocked<ICheckoutPolicy> => ({
  isShiftsEnabled: mock<ICheckoutPolicy['isShiftsEnabled']>(async () => false),
  activateShifts: mock<ICheckoutPolicy['activateShifts']>(async () => {}),
})

export const mockShiftRepository = (): Mocked<IShiftRepository> => ({
  create: mock<IShiftRepository['create']>(),
  findById: mock<IShiftRepository['findById']>(),
  findByIdForUpdate: mock<IShiftRepository['findByIdForUpdate']>(),
  findCurrentByRegister: mock<IShiftRepository['findCurrentByRegister']>(),
  list: mock<IShiftRepository['list']>(),
  update: mock<IShiftRepository['update']>(),
  cashDeltas: mock<IShiftRepository['cashDeltas']>(),
  addCashEntry: mock<IShiftRepository['addCashEntry']>(),
  hasCashRefund: mock<IShiftRepository['hasCashRefund']>(),
  listCashEntries: mock<IShiftRepository['listCashEntries']>(),
})

export const mockShiftLedger = (): Mocked<IShiftLedger> => ({
  assertOpenForCheckout: mock<IShiftLedger['assertOpenForCheckout']>(async () => {}),
  recordSaleCash: mock<IShiftLedger['recordSaleCash']>(async () => {}),
  recordSaleRefund: mock<IShiftLedger['recordSaleRefund']>(async () => {}),
})

export const mockShiftSettingsGuard = (): Mocked<IShiftSettingsGuard> => ({
  assertCurrencyChangeAllowed: mock<IShiftSettingsGuard['assertCurrencyChangeAllowed']>(async () => {}),
})

/** Adds nothing unless a test says otherwise. */
export const mockStarterOptionGroups = (): Mocked<IStarterOptionGroups> => ({
  addFor: mock<IStarterOptionGroups['addFor']>(async () => {}),
})

export const mockModifierRepository = (): Mocked<IModifierRepository> => ({
  findAllGroups: mock<IModifierRepository['findAllGroups']>(),
  findGroupView: mock<IModifierRepository['findGroupView']>(),
  findGroupById: mock<IModifierRepository['findGroupById']>(),
  findGroupsByIds: mock<IModifierRepository['findGroupsByIds']>(),
  findOptionById: mock<IModifierRepository['findOptionById']>(),
  findGroupsForProduct: mock<IModifierRepository['findGroupsForProduct']>(),
  createGroup: mock<IModifierRepository['createGroup']>(),
  updateGroup: mock<IModifierRepository['updateGroup']>(),
  createOption: mock<IModifierRepository['createOption']>(),
  updateOption: mock<IModifierRepository['updateOption']>(),
  setProductGroups: mock<IModifierRepository['setProductGroups']>(),
})

/** Resolves every choice to nothing by default: a product without option groups. */
/** Every product uncategorised unless a test says otherwise. */
export const mockQuoteProducts = (): Mocked<IQuoteProducts> => ({
  findById: mock<IQuoteProducts['findById']>(),
  categoriesOf: mock<IQuoteProducts['categoriesOf']>(async (productIds) => new Map(productIds.map((id) => [id, null]))),
})

export const mockLineOptionsResolver = (): Mocked<ILineOptionsResolver> => ({
  resolve: mock<ILineOptionsResolver['resolve']>(async () => ({ options: [], priceSatang: 0, costSatang: 0, key: '' })),
})

export const mockTableRepository = (): Mocked<ITableRepository> => ({
  findAll: mock<ITableRepository['findAll']>(),
  findById: mock<ITableRepository['findById']>(),
  create: mock<ITableRepository['create']>(),
  update: mock<ITableRepository['update']>(),
})

export const mockTableOccupancy = (): Mocked<ITableOccupancy> => ({
  byTable: mock<ITableOccupancy['byTable']>(async () => new Map()),
  openOrderCount: mock<ITableOccupancy['openOrderCount']>(async () => 0),
})

export const mockSetupCode = (): Mocked<ISetupCode> => ({
  issue: mock<ISetupCode['issue']>(() => 'ABCDEFGHJKMN'),
  verify: mock<ISetupCode['verify']>(() => 'accepted'),
  retire: mock<ISetupCode['retire']>(),
})

export const mockFirstRunGuard = (): Mocked<IFirstRunGuard> => ({
  countUsers: mock<IFirstRunGuard['countUsers']>(async () => 0),
  lockAndCountUsers: mock<IFirstRunGuard['lockAndCountUsers']>(async () => 0),
})

import type { IMemberRepository } from '../modules/members/applications/ports/member.repository'
import type { ISlideRepository } from '../modules/display-slides/applications/ports/slide.repository'
import type { IPromotionRepository } from '../modules/promotions/applications/ports/promotion.repository'
import type { IPriceQuoteRepository } from '../modules/quotes/applications/ports/price-quote.repository'
import type { IQuoteClaims } from '../modules/quotes/applications/ports/quote-claims.port'
import type { IPromotionCatalog } from '../modules/quotes/applications/ports/promotion-catalog.port'
import type { IOrderQuoteSource } from '../modules/quotes/applications/ports/order-quote-source.port'
export const mockPromotionRepository = (): Mocked<IPromotionRepository> => ({
  find: mock<IPromotionRepository['find']>(),
  findById: mock<IPromotionRepository['findById']>(),
  findByIdForUpdate: mock<IPromotionRepository['findByIdForUpdate']>(),
  create: mock<IPromotionRepository['create']>(),
  update: mock<IPromotionRepository['update']>(),
  setImageKey: mock<IPromotionRepository['setImageKey']>(),
})

export const mockMemberRepository = (): Mocked<IMemberRepository> => ({
  find: mock<IMemberRepository['find']>(),
  findById: mock<IMemberRepository['findById']>(),
  findByIdForUpdate: mock<IMemberRepository['findByIdForUpdate']>(),
  create: mock<IMemberRepository['create']>(),
  update: mock<IMemberRepository['update']>(),
})

export const mockPriceQuoteRepository = (): Mocked<IPriceQuoteRepository> => ({
  create: mock<IPriceQuoteRepository['create']>(),
  findById: mock<IPriceQuoteRepository['findById']>(),
  findByIdForUpdate: mock<IPriceQuoteRepository['findByIdForUpdate']>(),
  findByQrReference: mock<IPriceQuoteRepository['findByQrReference']>(async () => null),
  findByQrReferenceForUpdate: mock<IPriceQuoteRepository['findByQrReferenceForUpdate']>(async () => null),
  findReservedByOrder: mock<IPriceQuoteRepository['findReservedByOrder']>(async () => null),
  hasReservedForOrder: mock<IPriceQuoteRepository['hasReservedForOrder']>(async () => false),
  save: mock<IPriceQuoteRepository['save']>(async (quote) => quote),
})

/** No quote holds any QR by default, and every claim succeeds; a test sets what it is about. */
export const mockQuoteClaims = (): Mocked<IQuoteClaims> => ({
  lockForCheckout: mock<IQuoteClaims['lockForCheckout']>(),
  findHeldByReference: mock<IQuoteClaims['findHeldByReference']>(async () => null),
  findHeldByOrder: mock<IQuoteClaims['findHeldByOrder']>(async () => null),
  consume: mock<IQuoteClaims['consume']>(async () => {}),
  reserveForQr: mock<IQuoteClaims['reserveForQr']>(async () => {}),
  releaseByReference: mock<IQuoteClaims['releaseByReference']>(async () => {}),
  cancelByReference: mock<IQuoteClaims['cancelByReference']>(async () => {}),
})

export const mockPromotionCatalog = (): Mocked<IPromotionCatalog> => ({
  activePromotions: mock<IPromotionCatalog['activePromotions']>(async () => []),
})

import type { IPromotionUsage } from '../modules/quotes/applications/ports/promotion-usage.port'

/** Every promotion is unlimited and unlocked unless a test says otherwise. */
export const mockPromotionUsage = (): Mocked<IPromotionUsage> => ({
  countUses: mock<IPromotionUsage['countUses']>(async () => ({ total: 0, byMember: 0 })),
  countMany: mock<IPromotionUsage['countMany']>(async () => new Map()),
  lockForUse: mock<IPromotionUsage['lockForUse']>(async () => null),
})

export const mockOrderQuoteSource = (): Mocked<IOrderQuoteSource> => ({
  read: mock<IOrderQuoteSource['read']>(),
  lockOpenOrder: mock<IOrderQuoteSource['lockOpenOrder']>(),
})

export const mockRoleDirectory = (): Mocked<IRoleDirectory> => {
 const findById = mock<IRoleDirectory['findById']>(async () => null)
 return { findById, findByIdForUpdate: mock((id: number) => findById(id)),
  findBySystemKey: mock(async (key: 'owner' | 'cashier') => ({ id: key === 'owner' ? 1 : 2, name: key, systemKey: key })) }
}

export const mockAuditLog = (): Mocked<IAuditLog> => ({ record: mock(async () => {}), list: mock<IAuditLog['list']>() })

import type { IPinGuard } from '../modules/auth/applications/ports/pin-guard.port'

/** Counts attempts per user like the real guard (the 5th locks), without a clock: a lock lasts for the whole test. */
export const mockPinGuard = (): Mocked<IPinGuard> => {
  const attempts = new Map<number, number>()
  return {
    begin: mock((userId: number) => {
      const count = attempts.get(userId) ?? 0
      if (count >= 5) return 'locked' as const
      attempts.set(userId, count + 1)
      return 'ok' as const
    }),
    recordSuccess: mock((userId: number) => { attempts.delete(userId) }),
  }
}

import type { ILoginAttemptGuard } from '../modules/auth/applications/ports/login-attempt-guard.port'

/** Counts attempts per name like the real guard (the 5th locks), without a clock: a lock lasts for the whole test. */
export const mockLoginAttemptGuard = (): Mocked<ILoginAttemptGuard> => {
  const attempts = new Map<string, number>()
  return {
    begin: mock((username: string) => {
      const count = attempts.get(username) ?? 0
      if (count >= 5) return 'locked' as const
      attempts.set(username, count + 1)
      return 'ok' as const
    }),
    recordSuccess: mock((username: string) => { attempts.delete(username) }),
  }
}

import type { IStockReceiptRepository } from '../modules/stock-receipts/applications/ports/stock-receipt.repository'
export const mockStockReceiptRepository = (): Mocked<IStockReceiptRepository> => ({
  create: mock<IStockReceiptRepository['create']>(),
  appendItems: mock<IStockReceiptRepository['appendItems']>(),
  findById: mock<IStockReceiptRepository['findById']>(),
  findAll: mock<IStockReceiptRepository['findAll']>(),
})
