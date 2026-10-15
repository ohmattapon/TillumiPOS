import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { memberRepositoryToken, type IMemberRepository } from '../../../members/applications/ports/member.repository'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { lineKey, type LineOption } from '../../../../domains/modifier.domain'
import type { PriceQuoteEntity, QuoteRequestLine } from '../../../../domains/price-quote.domain'
import { SaleEntity, type SaleMember } from '../../../../domains/sale.domain'
import { branchRepositoryToken } from '../../../branches/applications/ports/branch.repository'
import type { IBranchRepository } from '../../../branches/applications/ports/branch.repository'
import { stockLedgerToken } from '../../../inventory/applications/ports/stock-ledger.port'
import { lineOptionsResolverToken } from '../../../modifiers/applications/ports/line-options-resolver.port'
import type { ILineOptionsResolver } from '../../../modifiers/applications/ports/line-options-resolver.port'
import type { IStockLedger } from '../../../inventory/applications/ports/stock-ledger.port'
import { qrPaymentClaimsToken } from '../../../qr-payments/applications/ports/qr-payment-claims.port'
import type { IQrPaymentClaims } from '../../../qr-payments/applications/ports/qr-payment-claims.port'
import { quoteClaimsToken, type IQuoteClaims } from '../../../quotes/applications/ports/quote-claims.port'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import { shopSettingsRepositoryToken } from '../../../settings/applications/ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import { TOKENS } from '../../../tokens'
import type { ICheckoutPolicy } from '../../../shared/ports/checkout-policy.port'
import type { IShiftLedger } from '../../../shared/ports/shift-ledger.port'
import { saleRepositoryToken } from '../ports/sale.repository'
import type { ISaleRepository } from '../ports/sale.repository'
import type { CheckoutLine, CheckoutRequest, ISaleCheckout } from '../ports/sale-checkout.port'

/** A QR payment that backs one of the sale's payments, with the reference the bank knows it by. */
interface ClaimedQr {
  id: number
  reference: string
}

/** What a request line is, in the terms a quote can be compared with. */
const toQuoteLine = (line: CheckoutLine): QuoteRequestLine => ({
  productId: line.productId,
  optionIds: line.options ? line.options.map((option) => option.optionId) : [...(line.optionIds ?? [])],
  quantity: line.quantity,
})

@injectable()
export class SaleCheckout implements ISaleCheckout {
  constructor(
    @inject(saleRepositoryToken) private readonly sales: ISaleRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(stockLedgerToken) private readonly ledger: IStockLedger,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(qrPaymentClaimsToken) private readonly qrPayments: IQrPaymentClaims,
    @inject(TOKENS.CheckoutPolicy) private readonly checkoutPolicy: ICheckoutPolicy,
    @inject(TOKENS.ShiftLedger) private readonly shiftLedger: IShiftLedger,
    @inject(branchRepositoryToken) private readonly branches: IBranchRepository,
    @inject(lineOptionsResolverToken) private readonly lineOptions: ILineOptionsResolver,
    @inject(memberRepositoryToken) private readonly members: IMemberRepository,
    @inject(quoteClaimsToken) private readonly quotes: IQuoteClaims,
  ) {}

  async checkout({ lines: requested, discountSatang, payments, cashier, branch, shiftId, memberId, quoteId }: CheckoutRequest) {
    const shiftsEnabled = await this.checkoutPolicy.isShiftsEnabled()
    if (shiftsEnabled && shiftId === undefined)
      throw new DomainConflictError('กรุณาระบุกะที่เปิดอยู่ก่อนรับชำระ', 'SHIFT_REQUIRED')
    if (!shiftsEnabled && shiftId !== undefined)
      throw new DomainConflictError('การชำระด้วยกะต้องเปิด CHECKOUT_MODE=shifts', 'CHECKOUT_MODE_REQUIRED')
    if (shiftId !== undefined) await this.shiftLedger.assertOpenForCheckout(shiftId, branch.id)

    // A sale from a pinned price claims its QR payments first and locks the quote after them: the same
    // order the QR commands lock in, and before any member or product, so none of them can wait in a circle.
    let quote: PriceQuoteEntity | null = null
    let claimed: ClaimedQr[] | null = null
    if (quoteId != null) {
      if (discountSatang > 0)
        throw new DomainConflictError('ใช้ราคาที่ตรึงไว้พร้อมส่วนลดที่กรอกเองไม่ได้', 'PROMOTION_AND_DISCOUNT_CONFLICT')
      claimed = await this.claimQrPayments(payments, branch.id, quoteId)
      quote = await this.quotes.lockForCheckout(
        quoteId,
        { branchId: branch.id, memberId: memberId ?? null, lines: requested.map(toQuoteLine) },
        claimed.map((qr) => qr.reference),
      )
    } else {
      // Checked before anything is priced: a QR that holds a pinned price is named as such (QUOTE_REQUIRED),
      // not reported as an underpaid sale. The claim only reads and locks the QR; nothing is written until commit.
      claimed = await this.claimQrPayments(payments, branch.id, null)
    }

    // Member lock precedes product locks, and the caller has already locked an order if present.
    // A quote carries its member: they were checked when the price was pinned, and the money may already
    // be paid, so a member who was switched off since does not stop the sale.
    let member: SaleMember | null
    if (quote) {
      member = quote.member ? { ...quote.member } : null
    } else {
      const selectedMember = memberId == null ? null : await this.members.findByIdForUpdate(memberId)
      if (memberId != null && !selectedMember)
        throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
      selectedMember?.assertActive()
      member = selectedMember ? { id: selectedMember.id, code: selectedMember.code, name: selectedMember.name } : null
    }

    // Lines are the product with its options: the same choice repeated is merged, a Map keeps the order
    // they were added, and the first quoted price of a line wins.
    interface WantedLine {
      productId: number
      options: LineOption[]
      quantity: number
      quotedUnitPriceSatang: number | undefined
    }
    const wanted = new Map<string, WantedLine>()
    if (quote) {
      // The quote has the options and the price of every line; nothing is resolved or priced again.
      for (const line of quote.lines) {
        const key = `${line.productId}:${lineKey(line.options)}`
        const existing = wanted.get(key)
        if (existing) existing.quantity += line.quantity
        else
          wanted.set(key, {
            productId: line.productId,
            options: [...line.options],
            quantity: line.quantity,
            quotedUnitPriceSatang: line.unitPriceSatang,
          })
      }
    } else {
      for (const line of requested) {
        // An order has already resolved its options and quoted a price; a one-step sale is resolved here.
        const options = line.options
          ? [...line.options]
          : (await this.lineOptions.resolve(line.productId, line.optionIds ?? [])).options
        const key = `${line.productId}:${lineKey(options)}`
        const existing = wanted.get(key)
        if (existing) existing.quantity += line.quantity
        else
          wanted.set(key, { productId: line.productId, options, quantity: line.quantity, quotedUnitPriceSatang: line.unitPriceSatang })
      }
    }

    // Read inside the caller's unit of work, so the sale is priced with the settings in force when it is recorded.
    const shop = await this.settings.get()
    const sellingBranch = await this.branches.findById(branch.id)

    // Stock is the product's, whichever options the lines have, so it is checked for the total.
    const quantities = new Map<number, number>()
    for (const line of wanted.values())
      quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity)

    // Locked until the sale commits, so two tills cannot sell the same last unit.
    const locked = await this.products.findManyForUpdate([...quantities.keys()], branch.id)
    const productsById = new Map(locked.map((product) => [product.id, product]))
    for (const [productId, quantity] of quantities) {
      const product = productsById.get(productId)
      if (!product) throw new DomainError('ไม่พบสินค้ารหัส ' + productId, 'PRODUCT_NOT_FOUND', { productId })
      product.assertSellable(quantity)
    }

    const lines = [...wanted.values()].map((line) => {
      const product = productsById.get(line.productId)!
      if (line.quotedUnitPriceSatang === undefined) return { product, quantity: line.quantity, options: line.options }
      // The quote includes the options and the entity adds them back, so the product carries the base price.
      const optionsPrice = line.options.reduce((total, option) => total + option.priceSatang, 0)
      return {
        product: product.with({ priceSatang: line.quotedUnitPriceSatang - optionsPrice }),
        quantity: line.quantity,
        options: line.options,
      }
    })

    const priced = SaleEntity.complete({
      lines,
      member,
      discountSatang: quote ? quote.discountSatang : discountSatang,
      promotion: quote?.promotion ?? null,
      payments: payments.map(({ method, amountSatang }) => ({ method, amountSatang })),
      vatMode: quote ? quote.vatMode : shop.vatMode,
      vatRateBp: quote ? quote.vatRateBp : shop.vatRateBp,
      branchId: branch.id,
      shiftId: shiftId ?? null,
      cashier,
      // Kept on the sale, so its receipt still reads the same after the shop is renamed or the branch moves.
      seller: {
        shopName: shop.shopName,
        shopTaxId: shop.taxId,
        branchName: sellingBranch?.name ?? null,
        shopAddress: sellingBranch?.address ?? shop.address,
        shopPhone: sellingBranch?.phone ?? shop.phone,
      },
    })
    // The pinned values are what the sale is made of, so this cannot differ; it guards the money all the same.
    if (quote && priced.totalSatang !== quote.totalSatang)
      throw new DomainConflictError('ยอดไม่ตรงกับราคาที่ตรึงไว้ กรุณาขอราคาใหม่', 'QUOTE_MISMATCH')

    // Taken only after every rule has passed; it still rolls back with the sale if a later step fails.
    const sale = await this.sales.create(priced, await this.sales.nextReceiptNo(branch))

    for (const { id } of claimed ?? []) await this.qrPayments.consume(id, sale.id)
    if (quote) await this.quotes.consume(quote, sale.id)

    for (const item of sale.items)
      await this.ledger.record({
        branchId: branch.id,
        productId: item.productId,
        type: 'sale',
        quantity: -item.quantity,
        reference: sale.receiptNo,
        userId: cashier.id,
      })

    if (shiftId !== undefined) {
      const cashTendered = sale.payments
        .filter((payment) => payment.method === 'cash')
        .reduce((amount, payment) => amount + payment.amountSatang, 0)
      const netCash = cashTendered - sale.changeSatang
      await this.shiftLedger.recordSaleCash({
        shiftId, branchId: branch.id, saleId: sale.id, receiptNo: sale.receiptNo,
        actorId: cashier.id, actorName: cashier.displayName, amountSatang: netCash, createdAt: sale.createdAt,
      })
    }

    return sale
  }

  /**
   * Checks the QR payments that back `promptpay` payments and returns them. When QR payment is
   * configured, a `promptpay` payment without one is refused: a cashier cannot just say it was paid.
   * Without a quote, a QR that holds one is refused too: the sale has to carry that quote or the quote
   * would stay held for good.
   */
  private async claimQrPayments(
    payments: CheckoutRequest['payments'],
    branchId: number,
    quoteId: number | null,
  ): Promise<ClaimedQr[]> {
    const claimed: ClaimedQr[] = []

    for (const payment of payments) {
      if (payment.qrPaymentId === undefined) {
        if (payment.method === 'promptpay' && this.qrPayments.isRequired())
          throw new DomainError('การชำระด้วยพร้อมเพย์ต้องรอธนาคารยืนยันก่อน', 'QR_PAYMENT_REQUIRED')
        continue
      }
      if (payment.method !== 'promptpay')
        throw new DomainError('ใช้การชำระด้วย QR ได้เฉพาะรายการพร้อมเพย์', 'QR_PAYMENT_REQUIRED')
      if (claimed.some((qr) => qr.id === payment.qrPaymentId))
        throw new DomainError('ใช้การชำระด้วย QR เดียวกันซ้ำในบิลเดียวไม่ได้', 'QR_ALREADY_USED')

      await this.qrPayments.assertClaimable(payment.qrPaymentId, { branchId, amountSatang: payment.amountSatang })
      const reference = await this.qrPayments.reference(payment.qrPaymentId)
      if (quoteId === null) {
        const held = await this.quotes.findReservedByReference(reference)
        if (held !== null)
          throw new DomainConflictError(
            'QR นี้ถูกสร้างจากราคาที่ตรึงไว้ กรุณาชำระด้วยราคานั้น',
            'QUOTE_REQUIRED',
            { quoteId: held },
          )
      }
      claimed.push({ id: payment.qrPaymentId, reference })
    }
    return claimed
  }
}
