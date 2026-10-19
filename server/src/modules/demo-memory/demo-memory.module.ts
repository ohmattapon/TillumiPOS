import { container } from 'tsyringe'
import { TOKENS } from '../tokens'
import { auditLogToken } from '../audit/applications/ports/audit-log.port'
import { sessionAuthorizationReaderToken } from '../auth/applications/ports/session-authorization-reader.port'
import { rolePermissionReaderToken } from '../auth/applications/ports/role-permission-reader.port'
import { MemorySessionAuthorizationReader } from '../auth/adapters/session-authorization.memory.reader'
import { branchRepositoryToken } from '../branches/applications/ports/branch.repository'
import { MemoryBranchRepository } from '../branches/adapters/repository/branch.memory.repository'
import { categoryRepositoryToken } from '../categories/applications/ports/category.repository'
import { MemoryCategoryRepository } from '../categories/adapters/repository/category.memory.repository'
import { slideRepositoryToken } from '../display-slides/applications/ports/slide.repository'
import { MemorySlideRepository } from '../display-slides/adapters/repository/slide.memory.repository'
import { stockMovementRepositoryToken } from '../inventory/applications/ports/stock-movement.repository'
import { MemoryStockMovementRepository } from '../inventory/adapters/repository/stock-movement.memory.repository'
import { memberRepositoryToken } from '../members/applications/ports/member.repository'
import { memberSalesHistoryToken } from '../members/applications/ports/member-sales-history.port'
import { MemoryMemberRepository } from '../members/adapters/repository/member.memory.repository'
import { modifierRepositoryToken } from '../modifiers/applications/ports/modifier.repository'
import { MemoryModifierRepository } from '../modifiers/adapters/repository/modifier.memory.repository'
import { orderRepositoryInnerToken, orderRepositoryToken } from '../orders/applications/ports/order.repository'
import { MemoryOrderRepository } from '../orders/adapters/repository/order.memory.repository'
import { MemoryTableOccupancy } from '../orders/adapters/repository/table-occupancy.memory.adapter'
import { productRepositoryToken } from '../products/applications/ports/product.repository'
import { MemoryProductRepository } from '../products/adapters/repository/product.memory.repository'
import { MemoryQuoteProducts } from '../products/adapters/repository/quote-products.memory.adapter'
import { promotionRepositoryToken } from '../promotions/applications/ports/promotion.repository'
import { MemoryPromotionRepository } from '../promotions/adapters/repository/promotion.memory.repository'
import { qrAttemptRepositoryToken } from '../qr-payments/applications/ports/qr-attempt.repository'
import { qrPaymentRepositoryToken } from '../qr-payments/applications/ports/qr-payment.repository'
import { qrShiftReadinessToken } from '../qr-payments/applications/ports/qr-shift-readiness.port'
import { MemoryQrAttemptRepository } from '../qr-payments/adapters/repository/qr-attempt.memory.repository'
import { MemoryQrPaymentRepository } from '../qr-payments/adapters/repository/qr-payment.memory.repository'
import { MemoryQrShiftReadiness } from '../qr-payments/adapters/repository/qr-shift-readiness.memory.adapter'
import { priceQuoteRepositoryToken } from '../quotes/applications/ports/price-quote.repository'
import { quoteProductsToken } from '../quotes/applications/ports/quote-products.port'
import { MemoryPriceQuoteRepository } from '../quotes/adapters/repository/price-quote.memory.repository'
import { roleRepositoryToken } from '../roles/applications/ports/role.repository'
import { roleUsageToken } from '../roles/applications/ports/role-usage.port'
import { MemoryRoleRepository } from '../roles/adapters/repository/role.memory.repository'
import { MemoryRoleDirectoryAdapter } from '../roles/adapters/role-directory.memory.adapter'
import { saleRepositoryToken } from '../sales/applications/ports/sale.repository'
import { salesReportRepositoryToken } from '../sales/applications/ports/sales-report.repository'
import { shiftSalesTotalsToken } from '../sales/applications/ports/shift-sales-totals.port'
import { MemorySaleRepository } from '../sales/adapters/repository/sale.memory.repository'
import { MemorySalesReportRepository } from '../sales/adapters/repository/sales-report.memory.repository'
import { MemoryShiftSalesTotals } from '../sales/adapters/repository/shift-sales-totals.memory.adapter'
import { MemoryMemberSalesHistory } from '../sales/adapters/repository/member-sales-history.memory.adapter'
import { shopSettingsRepositoryToken } from '../settings/applications/ports/shop-settings.repository'
import { MemoryShopSettingsRepository } from '../settings/adapters/repository/shop-settings.memory.repository'
import { firstRunGuardToken } from '../setup/applications/ports/first-run-guard.port'
import { commandReceiptsToken } from '../shared/ports/command-receipts.port'
import { MemoryCheckoutPolicy } from '../shared/adapters/memory-checkout-policy'
import { registerRepositoryToken } from '../shifts/applications/ports/register.repository'
import { shiftRepositoryToken } from '../shifts/applications/ports/shift.repository'
import { shiftSettingsGuardToken } from '../shifts/applications/ports/shift-settings-guard.port'
import { shiftSummaryRepositoryToken } from '../shifts/applications/ports/shift-summary.repository'
import { MemoryRegisterRepository } from '../shifts/adapters/repository/register.memory.repository'
import { MemoryShiftRepository } from '../shifts/adapters/repository/shift.memory.repository'
import { MemoryShiftLedgerAdapter } from '../shifts/adapters/repository/shift-ledger.memory.adapter'
import { MemoryShiftSettingsGuard } from '../shifts/adapters/repository/shift-settings-guard.memory.adapter'
import { MemoryShiftSummaryRepository } from '../shifts/adapters/repository/shift-summary.memory.repository'
import { stockReceiptRepositoryToken } from '../stock-receipts/applications/ports/stock-receipt.repository'
import { MemoryStockReceiptRepository } from '../stock-receipts/adapters/repository/stock-receipt.memory.repository'
import { tableRepositoryToken } from '../tables/applications/ports/table.repository'
import { tableOccupancyToken } from '../tables/applications/ports/table-occupancy.port'
import { MemoryTableRepository } from '../tables/adapters/repository/table.memory.repository'
import { userRepositoryToken } from '../users/applications/ports/user.repository'
import { roleDirectoryToken } from '../users/applications/ports/role-directory.port'
import { MemoryUserRepository } from '../users/adapters/repository/user.memory.repository'
import { MemoryFirstRunGuard } from '../users/adapters/repository/first-run-guard.memory.adapter'
import { MemoryRoleUsage } from '../users/adapters/repository/role-usage.memory.adapter'
import { MemoryAuditLog } from './memory/audit-log.memory'
import { MemoryCommandReceipts } from './memory/command-receipts.memory'
import { MemoryClock } from './memory/memory-clock'
import { MemoryUnitOfWork } from './memory/unit-of-work.memory'
import { seedDemoMemory } from './demo-seed'
import { env } from '../../libs/env'
import { resolveCacheConfig } from '../../libs/cache-config'
import { BunPasswordHasher } from '../shared/adapters/bun-password-hasher'
import { createMediaStorage } from '../shared/adapters/create-media-storage'
import { RedisReadCache } from '../shared/adapters/redis-read-cache'
import { RepositoryReadCache } from '../shared/adapters/repository-read-cache'
import { CommandIdempotency } from '../shared/applications/command-idempotency'
import { readCacheToken } from '../shared/ports/read-cache.port'
import { repositoryReadCacheToken } from '../shared/ports/repository-read-cache.port'
import { pinGuardToken } from '../auth/applications/ports/pin-guard.port'
import { InMemoryPinGuard } from '../auth/adapters/in-memory-pin-guard'
import { displaySessionStoreToken } from '../customer-display/applications/ports/display-session-store.port'
import { displayStreamToken } from '../customer-display/applications/ports/display-stream.port'
import { displayIdentifiersToken, pairingGuardToken } from '../customer-display/applications/ports/pairing-guard.port'
import { InMemoryDisplayHub } from '../customer-display/adapters/in-memory-display-hub'
import { CryptoDisplayIdentifiers, InMemoryPairingGuard } from '../customer-display/adapters/in-memory-pairing-guard'
import { slideIdGeneratorToken } from '../display-slides/applications/ports/slide-id-generator.port'
import { CryptoSlideIdGenerator } from '../display-slides/adapters/crypto-slide-id-generator'
import { stockLedgerToken } from '../inventory/applications/ports/stock-ledger.port'
import { StockLedger } from '../inventory/applications/services/stock-ledger'
import { quoteMembersToken } from '../quotes/applications/ports/quote-members.port'
import { lineOptionsResolverToken } from '../modifiers/applications/ports/line-options-resolver.port'
import { LineOptionsResolver } from '../modifiers/applications/services/line-options-resolver'
import { GroupDefaults } from '../modifiers/applications/services/group-defaults'
import { ModifierStarterOptionGroups } from '../modifiers/adapters/starter-option-groups'
import { starterOptionGroupsToken } from '../setup/applications/ports/starter-option-groups.port'
import { quoteLineOptionsToken } from '../quotes/applications/ports/quote-line-options.port'
import { quoteShopRulesToken } from '../quotes/applications/ports/quote-shop-rules.port'
import { orderEditLockToken } from '../orders/applications/ports/order-edit-lock.port'
import { OrderEditLock } from '../quotes/applications/services/order-edit-lock'
import { GuardedOrderRepository } from '../orders/applications/decorators/guarded-order.repository'
import { OrderQuoteSource } from '../orders/applications/services/order-quote-source'
import { orderQuoteSourceToken } from '../quotes/applications/ports/order-quote-source.port'
import { PromotionCatalog } from '../promotions/applications/services/promotion-catalog'
import { promotionCatalogToken } from '../quotes/applications/ports/promotion-catalog.port'
import { saleCheckoutToken } from '../sales/applications/ports/sale-checkout.port'
import { SaleCheckout } from '../sales/applications/services/sale-checkout'
import { qrPaymentClaimsToken } from '../qr-payments/applications/ports/qr-payment-claims.port'
import { qrPaymentGatewayToken } from '../qr-payments/applications/ports/qr-payment-gateway.port'
import { QrPaymentClaims } from '../qr-payments/applications/services/qr-payment-claims'
import { QrPaymentRefresher } from '../qr-payments/applications/services/qr-payment-refresher'
import { ScbQrGateway } from '../qr-payments/adapters/gateway/scb-qr.gateway'
import { quoteClaimsToken } from '../quotes/applications/ports/quote-claims.port'
import { QuoteClaims } from '../quotes/applications/services/quote-claims'
import { setupCodeToken } from '../setup/applications/ports/setup-code.port'
import { InMemorySetupCode } from '../setup/adapters/in-memory-setup-code'

// One hub for the whole process: it is both the session store and the live
// stream of the customer display, like in production.
const displayHub = new InMemoryDisplayHub()

// Demo composition root (DEMO_MODE=memory). Imported instead of the drizzle
// modules, so no database-backed binding exists in this process at all.
//
// Every memory implementation is one process-wide singleton holding its state
// in Maps: the class itself is registered as a singleton, and each port token
// aliases to it. Both registrations matter: provider twins take the concrete
// memory repository as a constructor parameter (resolved through the class),
// while use cases and the seeder resolve through the port token — the alias
// keeps both on the same instance and the same data.
const bind = (token: string, impl: new (...args: any[]) => unknown): void => {
  container.registerSingleton(impl)
  container.register(token, { useToken: impl })
}

// Shared kernel: clock, transactions, idempotency receipts, audit, policies.
bind(TOKENS.Clock, MemoryClock)
bind(TOKENS.UnitOfWork, MemoryUnitOfWork)
bind(commandReceiptsToken, MemoryCommandReceipts)
bind(auditLogToken, MemoryAuditLog)
bind(TOKENS.CheckoutPolicy, MemoryCheckoutPolicy)

// Shared adapters that never touch the database: hashing, media, idempotency
// and the read cache (stays idle without REDIS_URL, like in production).
bind(TOKENS.PasswordHasher, BunPasswordHasher)
container.register(TOKENS.MediaStorage, { useFactory: () => createMediaStorage() })
bind(TOKENS.Idempotency, CommandIdempotency)
container.registerInstance(readCacheToken, new RedisReadCache(resolveCacheConfig(env.databaseUrl)))
container.registerSingleton(repositoryReadCacheToken, RepositoryReadCache)

// Catalog repositories.
bind(branchRepositoryToken, MemoryBranchRepository)
bind(userRepositoryToken, MemoryUserRepository)
bind(roleRepositoryToken, MemoryRoleRepository)
bind(categoryRepositoryToken, MemoryCategoryRepository)
bind(productRepositoryToken, MemoryProductRepository)
bind(modifierRepositoryToken, MemoryModifierRepository)
bind(memberRepositoryToken, MemoryMemberRepository)
bind(promotionRepositoryToken, MemoryPromotionRepository)
bind(shopSettingsRepositoryToken, MemoryShopSettingsRepository)
bind(tableRepositoryToken, MemoryTableRepository)
bind(slideRepositoryToken, MemorySlideRepository)

// Transaction repositories.
bind(saleRepositoryToken, MemorySaleRepository)
bind(orderRepositoryInnerToken, MemoryOrderRepository)
bind(stockMovementRepositoryToken, MemoryStockMovementRepository)
bind(stockReceiptRepositoryToken, MemoryStockReceiptRepository)
bind(shiftRepositoryToken, MemoryShiftRepository)
bind(shiftSummaryRepositoryToken, MemoryShiftSummaryRepository)
bind(registerRepositoryToken, MemoryRegisterRepository)
bind(qrAttemptRepositoryToken, MemoryQrAttemptRepository)
bind(qrPaymentRepositoryToken, MemoryQrPaymentRepository)
bind(priceQuoteRepositoryToken, MemoryPriceQuoteRepository)
bind(salesReportRepositoryToken, MemorySalesReportRepository)

// Provider twins: answers one module gives another, read from the provider's
// own memory store.
bind(tableOccupancyToken, MemoryTableOccupancy)
bind(quoteProductsToken, MemoryQuoteProducts)
bind(qrShiftReadinessToken, MemoryQrShiftReadiness)
bind(memberSalesHistoryToken, MemoryMemberSalesHistory)
bind(shiftSalesTotalsToken, MemoryShiftSalesTotals)
bind(TOKENS.ShiftLedger, MemoryShiftLedgerAdapter)
bind(shiftSettingsGuardToken, MemoryShiftSettingsGuard)
bind(firstRunGuardToken, MemoryFirstRunGuard)
bind(roleUsageToken, MemoryRoleUsage)
bind(roleDirectoryToken, MemoryRoleDirectoryAdapter)
bind(rolePermissionReaderToken, MemoryRoleDirectoryAdapter)
bind(sessionAuthorizationReaderToken, MemorySessionAuthorizationReader)

// Port-only services and aliases: the same classes the drizzle modules bind,
// kept here because the demo branch never imports those modules. They only
// talk through the ports bound above, so they work unchanged on memory.
bind(stockLedgerToken, StockLedger)
bind(lineOptionsResolverToken, LineOptionsResolver)
bind(starterOptionGroupsToken, ModifierStarterOptionGroups)
bind(promotionCatalogToken, PromotionCatalog)
bind(orderQuoteSourceToken, OrderQuoteSource)
bind(orderEditLockToken, OrderEditLock)
bind(quoteClaimsToken, QuoteClaims)
bind(saleCheckoutToken, SaleCheckout)
bind(qrPaymentClaimsToken, QrPaymentClaims)
bind(orderRepositoryToken, GuardedOrderRepository)
bind(slideIdGeneratorToken, CryptoSlideIdGenerator)
container.register(quoteMembersToken, { useToken: memberRepositoryToken })
container.register(quoteLineOptionsToken, { useToken: lineOptionsResolverToken })
container.register(quoteShopRulesToken, { useToken: shopSettingsRepositoryToken })
container.registerSingleton(qrPaymentGatewayToken, ScbQrGateway)
container.registerSingleton(QrPaymentRefresher)
container.registerSingleton(GroupDefaults)

// Process-wide singletons that never touched the database.
container.registerInstance(pinGuardToken, new InMemoryPinGuard())
container.registerInstance(displaySessionStoreToken, displayHub)
container.registerInstance(displayStreamToken, displayHub)
container.registerInstance(pairingGuardToken, new InMemoryPairingGuard())
container.registerInstance(displayIdentifiersToken, new CryptoDisplayIdentifiers())
container.registerInstance(setupCodeToken, new InMemorySetupCode())

// Use cases and controllers need no binding: they are stateless, resolved by
// class, and tsyringe builds them on demand over the singletons above. A new
// port or token binding in a drizzle module must be mirrored here, and boot
// fails loudly (unregistered token) when one is missed.

// Seed once, before the app serves requests: the demo dataset (users with
// fixed credentials, catalog, three weeks of sales, shifts, open orders).
// Seeding twice is loud (DEMO_ALREADY_SEEDED) instead of duplicating data.
const summary = await seedDemoMemory(container)
console.log('================================================================')
console.log('DEMO MODE (memory): no database is used, all data resets on restart.')
console.log(
  `Seeded ${summary.users} users, ${summary.products} products, ${summary.sales} sales ` +
    `(${summary.voided} voided), ${summary.shifts} shifts, ${summary.orders} orders.`,
)
console.log('Demo credentials work in memory only. NEVER use demo mode with real data.')
console.log('================================================================')
