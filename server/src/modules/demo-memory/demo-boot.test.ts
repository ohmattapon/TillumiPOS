import 'reflect-metadata'
import { describe, expect, test } from 'bun:test'
import { container } from 'tsyringe'
import { LoginUseCase } from '../auth/applications/usecases/login.usecase'
import { CompleteSaleUseCase } from '../sales/applications/usecases/complete-sale.usecase'
import { GetSaleUseCase } from '../sales/applications/usecases/get-sale.usecase'
import { GetSalesReportUseCase } from '../sales/applications/usecases/get-sales-report.usecase'
import { VoidSaleUseCase } from '../sales/applications/usecases/void-sale.usecase'
import { GetShopSettingsUseCase } from '../settings/applications/usecases/get-shop-settings.usecase'
import { ListAuditLogsUseCase } from '../audit/applications/usecases/list-audit-logs.usecase'
import { auditLogToken } from '../audit/applications/ports/audit-log.port'
import { branchRepositoryToken, type IBranchRepository } from '../branches/applications/ports/branch.repository'
import { MemoryBranchRepository } from '../branches/adapters/repository/branch.memory.repository'
import { categoryRepositoryToken } from '../categories/applications/ports/category.repository'
import { MemoryCategoryRepository } from '../categories/adapters/repository/category.memory.repository'
import { stockMovementRepositoryToken } from '../inventory/applications/ports/stock-movement.repository'
import { MemoryStockMovementRepository } from '../inventory/adapters/repository/stock-movement.memory.repository'
import { stockLedgerToken } from '../inventory/applications/ports/stock-ledger.port'
import { StockLedger } from '../inventory/applications/services/stock-ledger'
import { memberRepositoryToken } from '../members/applications/ports/member.repository'
import { MemoryMemberRepository } from '../members/adapters/repository/member.memory.repository'
import { modifierRepositoryToken, type IModifierRepository } from '../modifiers/applications/ports/modifier.repository'
import { MemoryModifierRepository } from '../modifiers/adapters/repository/modifier.memory.repository'
import { lineOptionsResolverToken } from '../modifiers/applications/ports/line-options-resolver.port'
import { LineOptionsResolver } from '../modifiers/applications/services/line-options-resolver'
import { orderRepositoryInnerToken, orderRepositoryToken } from '../orders/applications/ports/order.repository'
import { MemoryOrderRepository } from '../orders/adapters/repository/order.memory.repository'
import { orderEditLockToken } from '../orders/applications/ports/order-edit-lock.port'
import { OrderEditLock } from '../quotes/applications/services/order-edit-lock'
import { orderQuoteSourceToken } from '../quotes/applications/ports/order-quote-source.port'
import { OrderQuoteSource } from '../orders/applications/services/order-quote-source'
import { GuardedOrderRepository } from '../orders/applications/decorators/guarded-order.repository'
import { productRepositoryToken, type IProductRepository } from '../products/applications/ports/product.repository'
import { MemoryProductRepository } from '../products/adapters/repository/product.memory.repository'
import { promotionRepositoryToken } from '../promotions/applications/ports/promotion.repository'
import { MemoryPromotionRepository } from '../promotions/adapters/repository/promotion.memory.repository'
import { qrPaymentRepositoryToken } from '../qr-payments/applications/ports/qr-payment.repository'
import { MemoryQrPaymentRepository } from '../qr-payments/adapters/repository/qr-payment.memory.repository'
import { qrAttemptRepositoryToken } from '../qr-payments/applications/ports/qr-attempt.repository'
import { MemoryQrAttemptRepository } from '../qr-payments/adapters/repository/qr-attempt.memory.repository'
import { qrPaymentGatewayToken } from '../qr-payments/applications/ports/qr-payment-gateway.port'
import { ScbQrGateway } from '../qr-payments/adapters/gateway/scb-qr.gateway'
import { qrPaymentClaimsToken } from '../qr-payments/applications/ports/qr-payment-claims.port'
import { QrPaymentClaims } from '../qr-payments/applications/services/qr-payment-claims'
import { priceQuoteRepositoryToken } from '../quotes/applications/ports/price-quote.repository'
import { MemoryPriceQuoteRepository } from '../quotes/adapters/repository/price-quote.memory.repository'
import { quoteClaimsToken } from '../quotes/applications/ports/quote-claims.port'
import { QuoteClaims } from '../quotes/applications/services/quote-claims'
import { roleRepositoryToken } from '../roles/applications/ports/role.repository'
import { MemoryRoleRepository } from '../roles/adapters/repository/role.memory.repository'
import { saleRepositoryToken } from '../sales/applications/ports/sale.repository'
import { MemorySaleRepository } from '../sales/adapters/repository/sale.memory.repository'
import { salesReportRepositoryToken } from '../sales/applications/ports/sales-report.repository'
import { MemorySalesReportRepository } from '../sales/adapters/repository/sales-report.memory.repository'
import { saleCheckoutToken } from '../sales/applications/ports/sale-checkout.port'
import { SaleCheckout } from '../sales/applications/services/sale-checkout'
import { shopSettingsRepositoryToken } from '../settings/applications/ports/shop-settings.repository'
import { MemoryShopSettingsRepository } from '../settings/adapters/repository/shop-settings.memory.repository'
import { shiftRepositoryToken } from '../shifts/applications/ports/shift.repository'
import { MemoryShiftRepository } from '../shifts/adapters/repository/shift.memory.repository'
import { MemoryShiftLedgerAdapter } from '../shifts/adapters/repository/shift-ledger.memory.adapter'
import { shiftSummaryRepositoryToken } from '../shifts/applications/ports/shift-summary.repository'
import { MemoryShiftSummaryRepository } from '../shifts/adapters/repository/shift-summary.memory.repository'
import { registerRepositoryToken } from '../shifts/applications/ports/register.repository'
import { MemoryRegisterRepository } from '../shifts/adapters/repository/register.memory.repository'
import { tableRepositoryToken } from '../tables/applications/ports/table.repository'
import { MemoryTableRepository } from '../tables/adapters/repository/table.memory.repository'
import { userRepositoryToken } from '../users/applications/ports/user.repository'
import { MemoryUserRepository } from '../users/adapters/repository/user.memory.repository'
import { TOKENS } from '../tokens'
import { BunPasswordHasher } from '../shared/adapters/bun-password-hasher'
import { MemoryCheckoutPolicy } from '../shared/adapters/memory-checkout-policy'
import { MemoryAuditLog } from './memory/audit-log.memory'
import { MemoryClock } from './memory/memory-clock'
import { MemoryUnitOfWork } from './memory/unit-of-work.memory'
import { seedDemoMemory } from './demo-seed'

/**
 * Demo smoke test: boots the memory composition (the same token-to-memory
 * pairs as demo-memory.module.ts, scoped to a child container so this file
 * stays independent of every other test) with no database, then drives real
 * use cases end to end: owner login, settings read, one cash sale, read-back,
 * sales report, void, and the audit trail. Never imports server/test/harness,
 * which mandates PostgreSQL.
 */
describe('demo boot (no database)', () => {
  test('login, settings, sell, report, void and audit all work on memory', async () => {
    const previousMode = Bun.env.CHECKOUT_MODE
    Bun.env.CHECKOUT_MODE = 'legacy'
    try {
      const scope = container.createChildContainer()
      const bind = (token: string, impl: new (...args: never[]) => unknown): void => {
        scope.registerSingleton(impl)
        scope.register(token, { useToken: impl })
      }

      bind(TOKENS.Clock, MemoryClock)
      bind(TOKENS.UnitOfWork, MemoryUnitOfWork)
      bind(TOKENS.PasswordHasher, BunPasswordHasher)
      bind(TOKENS.CheckoutPolicy, MemoryCheckoutPolicy)
      bind(TOKENS.ShiftLedger, MemoryShiftLedgerAdapter)
      bind(auditLogToken, MemoryAuditLog)
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
      bind(saleRepositoryToken, MemorySaleRepository)
      bind(salesReportRepositoryToken, MemorySalesReportRepository)
      bind(orderRepositoryInnerToken, MemoryOrderRepository)
      bind(orderRepositoryToken, GuardedOrderRepository)
      bind(orderEditLockToken, OrderEditLock)
      bind(orderQuoteSourceToken, OrderQuoteSource)
      bind(stockMovementRepositoryToken, MemoryStockMovementRepository)
      bind(stockLedgerToken, StockLedger)
      bind(lineOptionsResolverToken, LineOptionsResolver)
      bind(saleCheckoutToken, SaleCheckout)
      bind(qrPaymentClaimsToken, QrPaymentClaims)
      bind(qrPaymentGatewayToken, ScbQrGateway)
      bind(qrPaymentRepositoryToken, MemoryQrPaymentRepository)
      bind(qrAttemptRepositoryToken, MemoryQrAttemptRepository)
      bind(priceQuoteRepositoryToken, MemoryPriceQuoteRepository)
      bind(quoteClaimsToken, QuoteClaims)
      bind(shiftRepositoryToken, MemoryShiftRepository)
      bind(shiftSummaryRepositoryToken, MemoryShiftSummaryRepository)
      bind(registerRepositoryToken, MemoryRegisterRepository)

      const summary = await seedDemoMemory(scope)
      expect(summary.users).toBe(3)
      expect(summary.products).toBeGreaterThan(0)
      expect(summary.sales).toBeGreaterThan(0)

      const owner = await scope.resolve(LoginUseCase).execute({
        username: 'admin',
        password: 'demo-owner-1234',
      })
      expect(owner.role).toBe('owner')

      const actor = { role: 'owner' as const, id: owner.id, displayName: owner.displayName }

      const branches = scope.resolve<IBranchRepository>(branchRepositoryToken)
      const main = await branches.findMain()
      expect(main).not.toBeNull()
      const branch = { id: main!.id, code: main!.code }

      const settings = await scope.resolve(GetShopSettingsUseCase).execute()
      expect(settings.shopName).toBe('ร้านกาแฟบ้านสวน')
      expect(settings.timeZone).toBe('Asia/Bangkok')

      const products = scope.resolve<IProductRepository>(productRepositoryToken)
      const modifiers = scope.resolve<IModifierRepository>(modifierRepositoryToken)
      const page = await products.findAll({ branchId: branch.id, limit: 100, offset: 0 })
      // Drinks carry a required sweetness group; the smoke sale stays a plain
      // line, so it picks the first stocked product with no option groups.
      let product = null
      for (const candidate of page.items) {
        if (!candidate.isActive || (candidate.trackStock && candidate.stockQty < 1)) continue
        if ((await modifiers.findGroupsForProduct(candidate.id)).length > 0) continue
        product = candidate
        break
      }
      expect(product).not.toBeNull()
      if (product === null) throw new Error('demo seed has no stocked product without option groups')

      const sale = await scope.resolve(CompleteSaleUseCase).execute(
        {
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'cash', amountSatang: product.priceSatang }],
        },
        { id: owner.id, displayName: owner.displayName },
        branch,
      )
      expect(sale.status).toBe('completed')
      expect(sale.totalSatang).toBe(product.priceSatang)
      expect(sale.changeSatang).toBe(0)

      const readBack = await scope.resolve(GetSaleUseCase).execute(sale.id, branch.id)
      expect(readBack.id).toBe(sale.id)
      expect(readBack.receiptNo).toBe(sale.receiptNo)
      expect(readBack.status).toBe('completed')

      const day = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(sale.createdAt)
      const report = await scope.resolve(GetSalesReportUseCase).execute(
        { from: day, to: day, scope: 'branch' },
        actor,
        branch.id,
      )
      expect(report.summary.saleCount).toBeGreaterThanOrEqual(1)

      const voided = await scope.resolve(VoidSaleUseCase).execute(
        sale.id,
        { reason: 'ทดสอบ smoke: ตรวจ audit' },
        actor,
        branch.id,
      )
      expect(voided.status).toBe('voided')

      const trail = await scope.resolve(ListAuditLogsUseCase).execute(
        { action: 'sale.void', entityType: 'sale', entityId: String(sale.id) },
        actor,
      )
      expect(trail.total).toBeGreaterThanOrEqual(1)
      expect(trail.items[0]).toMatchObject({
        action: 'sale.void',
        entityType: 'sale',
        entityId: String(sale.id),
      })
    } finally {
      if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
      else Bun.env.CHECKOUT_MODE = previousMode
    }
  }, 60_000)
})
