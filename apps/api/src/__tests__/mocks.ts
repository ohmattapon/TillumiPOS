import { mock, type Mock } from 'bun:test'
import type { ISalesReportRepository } from '../modules/sales/applications/ports/sales-report.repository'

export const mockSalesReportRepository = (): Mocked<ISalesReportRepository> => ({
  overview: mock<ISalesReportRepository['overview']>(),
  products: mock<ISalesReportRepository['products']>(),
  branches: mock<ISalesReportRepository['branches']>(),
})
import type { IBranchRepository } from '../modules/branches/applications/ports/branch.repository'
import type { ICategoryRepository } from '../modules/categories/applications/ports/category.repository'
import type { IKitchenOrderRefs } from '../modules/kitchen/applications/ports/kitchen-order-refs.port'
import type { IKitchenRoutingRepository } from '../modules/kitchen/applications/ports/kitchen-routing.repository'
import type { IKitchenStationRepository } from '../modules/kitchen/applications/ports/kitchen-station.repository'
import type { IKitchenTicketRepository } from '../modules/kitchen/applications/ports/kitchen-ticket.repository'
import type { IStockLedger } from '../modules/inventory/applications/ports/stock-ledger.port'
import type { IStockMovementRepository } from '../modules/inventory/applications/ports/stock-movement.repository'
import type { ILineOptionsResolver } from '../modules/modifiers/applications/ports/line-options-resolver.port'
import type { IModifierRepository } from '../modules/modifiers/applications/ports/modifier.repository'
import type { IKitchenTickets } from '../modules/orders/applications/ports/kitchen-tickets.port'
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
import type { IRegisterRepository } from '../modules/shifts/applications/ports/register.repository'
import type { ISaleRepository } from '../modules/sales/applications/ports/sale.repository'
import type { IMediaStorage } from '../modules/shared/ports/media-storage.port'
import type { IPasswordHasher } from '../modules/shared/ports/password-hasher.port'
import type { IUnitOfWork } from '../modules/shared/ports/unit-of-work.port'
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

export const mockUserRepository = (): Mocked<IUserRepository> => ({
  findAll: mock<IUserRepository['findAll']>(),
  findById: mock<IUserRepository['findById']>(),
  findByIdForUpdate: mock<IUserRepository['findByIdForUpdate']>(),
  findActiveById: mock<IUserRepository['findActiveById']>(),
  findCredentialsByUsername: mock<IUserRepository['findCredentialsByUsername']>(),
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
  findUnclaimed: mock<IQrPaymentRepository['findUnclaimed']>(),
  save: mock<IQrPaymentRepository['save']>(async (payment) => payment),
})

export const mockQrPaymentGateway = (): Mocked<IQrPaymentGateway> => ({
  isEnabled: mock<IQrPaymentGateway['isEnabled']>(() => true),
  createQr: mock<IQrPaymentGateway['createQr']>(),
  findPayment: mock<IQrPaymentGateway['findPayment']>(),
})

export const mockClock = (now: Date) => ({ now: mock(() => now) })

export const mockQrPaymentClaims = (): Mocked<IQrPaymentClaims> => ({
  isRequired: mock<IQrPaymentClaims['isRequired']>(() => false),
  assertClaimable: mock<IQrPaymentClaims['assertClaimable']>(async () => {}),
  consume: mock<IQrPaymentClaims['consume']>(async () => {}),
})

export const mockOrderRepository = (): Mocked<IOrderRepository> => ({
  create: mock<IOrderRepository['create']>(),
  findById: mock<IOrderRepository['findById']>(),
  findByIdForUpdate: mock<IOrderRepository['findByIdForUpdate']>(),
  findAll: mock<IOrderRepository['findAll']>(),
  save: mock<IOrderRepository['save']>(),
})

/** Answers "nothing sent, nothing pending" unless a test says otherwise. */
export const mockKitchenTickets = (): Mocked<IKitchenTickets> => ({
  sentByLine: mock<IKitchenTickets['sentByLine']>(async () => new Map()),
  hasPending: mock<IKitchenTickets['hasPending']>(async () => false),
  reconcile: mock<IKitchenTickets['reconcile']>(async () => undefined),
  moveTickets: mock<IKitchenTickets['moveTickets']>(async () => undefined),
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

export const mockShiftLedger = (): Mocked<IShiftLedger> => ({
  assertOpenForCheckout: mock<IShiftLedger['assertOpenForCheckout']>(async () => {}),
  recordSaleCash: mock<IShiftLedger['recordSaleCash']>(async () => {}),
  recordSaleRefund: mock<IShiftLedger['recordSaleRefund']>(async () => {}),
})

export const mockShiftSettingsGuard = (): Mocked<IShiftSettingsGuard> => ({
  assertCurrencyChangeAllowed: mock<IShiftSettingsGuard['assertCurrencyChangeAllowed']>(async () => {}),
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

export const mockKitchenStationRepository = (): Mocked<IKitchenStationRepository> => ({
  findAll: mock<IKitchenStationRepository['findAll']>(),
  findById: mock<IKitchenStationRepository['findById']>(),
  create: mock<IKitchenStationRepository['create']>(),
  update: mock<IKitchenStationRepository['update']>(),
})

export const mockKitchenRoutingRepository = (): Mocked<IKitchenRoutingRepository> => ({
  stationsByCategory: mock<IKitchenRoutingRepository['stationsByCategory']>(async () => new Map()),
  setStation: mock<IKitchenRoutingRepository['setStation']>(async () => undefined),
})

export const mockKitchenTicketRepository = (): Mocked<IKitchenTicketRepository> => ({
  nextRoundNo: mock<IKitchenTicketRepository['nextRoundNo']>(async () => 1),
  create: mock<IKitchenTicketRepository['create']>(),
  findByIdForUpdate: mock<IKitchenTicketRepository['findByIdForUpdate']>(),
  save: mock<IKitchenTicketRepository['save']>(),
  findPending: mock<IKitchenTicketRepository['findPending']>(),
})

export const mockKitchenOrderRefs = (): Mocked<IKitchenOrderRefs> => ({
  refsOf: mock<IKitchenOrderRefs['refsOf']>(async () => new Map()),
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
