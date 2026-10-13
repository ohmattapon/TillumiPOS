import { inject, injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { SaleEntity } from '../../../../domains/sale.domain'
import { stockLedgerToken } from '../../../inventory/applications/ports/stock-ledger.port'
import type { IStockLedger } from '../../../inventory/applications/ports/stock-ledger.port'
import { qrPaymentClaimsToken } from '../../../qr-payments/applications/ports/qr-payment-claims.port'
import type { IQrPaymentClaims } from '../../../qr-payments/applications/ports/qr-payment-claims.port'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import { shopSettingsRepositoryToken } from '../../../settings/applications/ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import { saleRepositoryToken } from '../ports/sale.repository'
import type { ISaleRepository } from '../ports/sale.repository'
import type { CheckoutRequest, ISaleCheckout } from '../ports/sale-checkout.port'

@injectable()
export class SaleCheckout implements ISaleCheckout {
  constructor(
    @inject(saleRepositoryToken) private readonly sales: ISaleRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(stockLedgerToken) private readonly ledger: IStockLedger,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(qrPaymentClaimsToken) private readonly qrPayments: IQrPaymentClaims,
  ) {}

  async checkout({ lines: requested, discountSatang, payments, cashier, branch }: CheckoutRequest) {
    // Merge repeated products; a Map keeps the order they were added. The first quoted price of a product wins.
    const quantities = new Map<number, number>()
    const quoted = new Map<number, number>()
    for (const line of requested) {
      quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity)
      if (line.unitPriceSatang !== undefined && !quoted.has(line.productId)) quoted.set(line.productId, line.unitPriceSatang)
    }

    // Read inside the caller's unit of work, so the sale is priced with the settings in force when it is recorded.
    const shop = await this.settings.get()

    // Locked until the sale commits, so two tills cannot sell the same last unit.
    const locked = await this.products.findManyForUpdate([...quantities.keys()], branch.id)
    const productsById = new Map(locked.map((product) => [product.id, product]))

    const lines = [...quantities].map(([productId, quantity]) => {
      const product = productsById.get(productId)
      if (!product) throw new DomainError('ไม่พบสินค้ารหัส ' + productId, 'PRODUCT_NOT_FOUND', { productId })
      product.assertSellable(quantity)
      const price = quoted.get(productId)
      return { product: price === undefined ? product : product.with({ priceSatang: price }), quantity }
    })

    const priced = SaleEntity.complete({
      lines,
      discountSatang,
      payments: payments.map(({ method, amountSatang }) => ({ method, amountSatang })),
      vatMode: shop.vatMode,
      vatRateBp: shop.vatRateBp,
      branchId: branch.id,
      cashier,
    })
    // Money that a bank has confirmed backs QR payments; checked here, after the amounts are known to add up.
    const claimed = await this.claimQrPayments(payments, branch.id)

    // Taken only after every rule has passed; it still rolls back with the sale if a later step fails.
    const sale = await this.sales.create(priced, await this.sales.nextReceiptNo(branch))

    for (const qrPaymentId of claimed) await this.qrPayments.consume(qrPaymentId, sale.id)

    for (const item of sale.items)
      await this.ledger.record({
        branchId: branch.id,
        productId: item.productId,
        type: 'sale',
        quantity: -item.quantity,
        reference: sale.receiptNo,
        userId: cashier.id,
      })

    return sale
  }

  /**
   * Checks the QR payments that back `promptpay` payments and returns their ids. When QR payment is
   * configured, a `promptpay` payment without one is refused: a cashier cannot just say it was paid.
   */
  private async claimQrPayments(payments: CheckoutRequest['payments'], branchId: number): Promise<number[]> {
    const claimed: number[] = []

    for (const payment of payments) {
      if (payment.qrPaymentId === undefined) {
        if (payment.method === 'promptpay' && this.qrPayments.isRequired())
          throw new DomainError('การชำระด้วยพร้อมเพย์ต้องรอธนาคารยืนยันก่อน', 'QR_PAYMENT_REQUIRED')
        continue
      }
      if (payment.method !== 'promptpay')
        throw new DomainError('ใช้การชำระด้วย QR ได้เฉพาะรายการพร้อมเพย์', 'QR_PAYMENT_REQUIRED')
      if (claimed.includes(payment.qrPaymentId))
        throw new DomainError('ใช้การชำระด้วย QR เดียวกันซ้ำในบิลเดียวไม่ได้', 'QR_ALREADY_USED')

      await this.qrPayments.assertClaimable(payment.qrPaymentId, { branchId, amountSatang: payment.amountSatang })
      claimed.push(payment.qrPaymentId)
    }
    return claimed
  }
}
