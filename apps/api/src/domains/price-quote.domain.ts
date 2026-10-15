import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { lineKey, type LineOption } from './modifier.domain'
import { calculateTotals, type VatMode } from './pricing'
import { MAX_AMOUNT_SATANG, type SaleMember, type SalePromotion } from './sale.domain'

export const QUOTE_STATUSES = ['open', 'reserved', 'consumed', 'cancelled'] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

/** How long an open quote can be sold against. A quote held by a QR does not expire by time. */
export const QUOTE_VALID_FOR_MS = 15 * 60 * 1000

/** One priced line, as it was when the quote was made. `unitPriceSatang` includes the options. */
export interface QuoteLine {
  productId: number
  productName: string
  sku: string
  unitPriceSatang: number
  quantity: number
  options: LineOption[]
}

/** What a sale asks for, in the terms a quote can be compared with. */
export interface QuoteRequestLine {
  productId: number
  optionIds: readonly number[]
  quantity: number
}

export interface QuoteRequest {
  branchId: number
  memberId: number | null
  /** The open order being paid, or null for a one-step cart. A quote belongs to exactly one of these. */
  orderId: number | null
  lines: readonly QuoteRequestLine[]
}

export interface NewPriceQuote {
  branchId: number
  memberId: number | null
  member: SaleMember | null
  /** The open order this quote prices; null for a one-step cart. */
  orderId: number | null
  lines: QuoteLine[]
  promotion: SalePromotion | null
  /** The VAT rules in force when the quote was made; the sale uses these, not the current ones. */
  vatMode: VatMode
  vatRateBp: number
  createdById: number
}

export interface PricedQuote extends NewPriceQuote {
  subtotalSatang: number
  discountSatang: number
  vatSatang: number
  totalSatang: number
  expiresAt: Date
}

export interface PriceQuoteProps extends PricedQuote {
  id: number
  status: QuoteStatus
  /** Reference 1 of the QR that holds this quote while it is `reserved`. */
  qrReference: string | null
  saleId: number | null
  createdAt: Date
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
const tooLarge = () => new DomainError('ยอดเงินเกินกว่าที่ระบบรองรับ', 'AMOUNT_TOO_LARGE')
const notOpen = () => new DomainConflictError('ราคานี้ถูกใช้หรือถูกยกเลิกไปแล้ว หรือกำลังรอการชำระด้วย QR', 'QUOTE_NOT_OPEN')
const mismatch = () =>
  new DomainConflictError('รายการ สมาชิก หรือสาขาไม่ตรงกับราคาที่ตรึงไว้ กรุณาขอราคาใหม่', 'QUOTE_MISMATCH')
const expired = () => new DomainConflictError('ราคาที่ตรึงไว้หมดอายุแล้ว กรุณาขอราคาใหม่', 'QUOTE_EXPIRED')

const keyOf = (productId: number, optionIds: readonly number[]) =>
  `${productId}:${lineKey(optionIds.map((optionId) => ({ optionId })))}`

/** Quantity per line of a cart, with repeated lines added together. */
function quantities(lines: readonly { productId: number; optionIds: readonly number[]; quantity: number }[]) {
  const byKey = new Map<string, number>()
  for (const line of lines) {
    const key = keyOf(line.productId, line.optionIds)
    byKey.set(key, (byKey.get(key) ?? 0) + line.quantity)
  }
  return byKey
}

/**
 * A cart the server has priced and pinned: the lines with their unit prices, the promotion and VAT
 * rules that applied, and the total. A sale made from it charges exactly this, whatever the shop
 * changed since, which is what lets money paid by QR always become a bill of the same amount.
 */
export class PriceQuoteEntity {
  public readonly id: number
  public readonly branchId: number
  public readonly memberId: number | null
  public readonly member: Readonly<SaleMember> | null
  public readonly orderId: number | null
  public readonly lines: readonly QuoteLine[]
  public readonly promotion: Readonly<SalePromotion> | null
  public readonly vatMode: VatMode
  public readonly vatRateBp: number
  public readonly subtotalSatang: number
  public readonly discountSatang: number
  public readonly vatSatang: number
  public readonly totalSatang: number
  public readonly status: QuoteStatus
  public readonly qrReference: string | null
  public readonly saleId: number | null
  public readonly createdById: number
  public readonly expiresAt: Date
  public readonly createdAt: Date

  constructor(props: PriceQuoteProps) {
    if (!QUOTE_STATUSES.includes(props.status)) throw new DomainError('สถานะของราคาที่ตรึงไว้ไม่ถูกต้อง', 'INVALID_QUOTE')
    if (props.status === 'reserved' && props.qrReference === null)
      throw new DomainError('ราคาที่ถูกจองต้องมีรหัสอ้างอิงของ QR', 'INVALID_QUOTE')
    if (props.status === 'consumed' && props.saleId === null)
      throw new DomainError('ราคาที่ใช้แล้วต้องมีบิลขาย', 'INVALID_QUOTE')

    this.id = props.id
    this.branchId = props.branchId
    this.memberId = props.memberId
    this.member = props.member ? Object.freeze({ ...props.member }) : null
    this.orderId = props.orderId
    this.lines = props.lines.map((line) => ({ ...line, options: line.options.map((option) => ({ ...option })) }))
    this.promotion = props.promotion ? Object.freeze({ ...props.promotion }) : null
    this.vatMode = props.vatMode
    this.vatRateBp = props.vatRateBp
    this.subtotalSatang = props.subtotalSatang
    this.discountSatang = props.discountSatang
    this.vatSatang = props.vatSatang
    this.totalSatang = props.totalSatang
    this.status = props.status
    this.qrReference = props.qrReference
    this.saleId = props.saleId
    this.createdById = props.createdById
    this.expiresAt = props.expiresAt
    this.createdAt = props.createdAt
  }

  /** Prices the lines with the promotion chosen for them and the VAT rules given. */
  static price(input: NewPriceQuote, now: Date): PricedQuote {
    if (input.lines.length === 0) throw new DomainError('ตะกร้าต้องมีสินค้าอย่างน้อย 1 รายการ', 'EMPTY_SALE')
    if (input.lines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1))
      throw new DomainError('จำนวนสินค้าต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป', 'INVALID_QUANTITY')

    const subtotalSatang = sum(input.lines.map((line) => line.unitPriceSatang * line.quantity))
    if (subtotalSatang > MAX_AMOUNT_SATANG) throw tooLarge()
    const discountSatang = input.promotion?.discountSatang ?? 0
    if (discountSatang > subtotalSatang) throw new DomainError('ส่วนลดมากกว่ายอดรวมสินค้า', 'DISCOUNT_TOO_LARGE')
    const { vatSatang, totalSatang } = calculateTotals({
      subtotalSatang, discountSatang, vatMode: input.vatMode, vatRateBp: input.vatRateBp,
    })
    if (totalSatang > MAX_AMOUNT_SATANG) throw tooLarge()

    return {
      ...input,
      lines: input.lines.map((line) => ({ ...line, options: [...line.options] })),
      vatRateBp: input.vatMode === 'none' ? 0 : input.vatRateBp,
      subtotalSatang,
      discountSatang,
      vatSatang,
      totalSatang,
      expiresAt: new Date(now.getTime() + QUOTE_VALID_FOR_MS),
    }
  }

  /** Whether a sale for this branch, member and cart is the one this quote was made for. */
  matches(request: QuoteRequest): boolean {
    if (request.branchId !== this.branchId || request.memberId !== this.memberId || request.orderId !== this.orderId) return false
    const wanted = quantities(request.lines)
    const own = quantities(this.lines.map((line) => ({ ...line, optionIds: line.options.map((option) => option.optionId) })))
    if (wanted.size !== own.size) return false
    for (const [key, quantity] of own) if (wanted.get(key) !== quantity) return false
    return true
  }

  /**
   * Throws unless a sale for `request` may use this quote now. `claimedReferences` are the QR payments
   * backing the sale: a quote held by a QR is sold only with that QR, and a QR made without this quote
   * cannot pay for it. A cancelled quote is sold only with the paid QR it held: that money still arrives.
   */
  assertSellable(request: QuoteRequest, now: Date, claimedReferences: readonly string[]): void {
    if (this.status === 'consumed') throw notOpen()
    if (this.status === 'open') {
      if (now.getTime() >= this.expiresAt.getTime()) throw expired()
      if (claimedReferences.length > 0) throw mismatch()
    } else if (claimedReferences.length === 0 || claimedReferences.some((reference) => reference !== this.qrReference)) {
      throw notOpen()
    }
    if (!this.matches(request)) throw mismatch()
  }

  /** A QR can be for part of the total (the rest paid another way) but never for more. */
  assertQrAmount(amountSatang: number): void {
    if (amountSatang > this.totalSatang)
      throw new DomainConflictError('ยอด QR เกินยอดของราคาที่ตรึงไว้', 'QUOTE_AMOUNT_MISMATCH', { totalSatang: this.totalSatang })
  }

  /** Holds the quote for the QR with this reference. The same reference again changes nothing. */
  reserve(reference: string, now: Date): PriceQuoteEntity {
    if (this.status === 'reserved' && this.qrReference === reference) return this
    if (this.status !== 'open') throw notOpen()
    if (now.getTime() >= this.expiresAt.getTime()) throw expired()
    return this.change({ status: 'reserved', qrReference: reference })
  }

  /** The QR was cancelled or never made: the quote is open again (and may have expired meanwhile). */
  release(reference: string): PriceQuoteEntity {
    if (this.status !== 'reserved' || this.qrReference !== reference) return this
    return this.change({ status: 'open', qrReference: null })
  }

  /** The QR's money was set aside by the owner and will never be billed: the quote is closed. */
  cancelReserved(reference: string): PriceQuoteEntity {
    if (this.status !== 'reserved' || this.qrReference !== reference) return this
    return this.change({ status: 'cancelled' })
  }

  /** The till abandons the quote. One that a QR holds, or a sale used, cannot be cancelled. */
  cancel(): PriceQuoteEntity {
    if (this.status === 'cancelled') return this
    if (this.status !== 'open') throw notOpen()
    return this.change({ status: 'cancelled' })
  }

  /** A sale uses it up. A cancelled quote can be used only when a paid QR still names it (see assertSellable). */
  consume(saleId: number): PriceQuoteEntity {
    const cancelledWithQr = this.status === 'cancelled' && this.qrReference !== null
    if (this.status !== 'open' && this.status !== 'reserved' && !cancelledWithQr) throw notOpen()
    return this.change({ status: 'consumed', saleId })
  }

  toSnapshot(): PriceQuoteProps {
    return {
      id: this.id,
      branchId: this.branchId,
      memberId: this.memberId,
      member: this.member ? { ...this.member } : null,
      orderId: this.orderId,
      lines: this.lines.map((line) => ({ ...line, options: line.options.map((option) => ({ ...option })) })),
      promotion: this.promotion ? { ...this.promotion } : null,
      vatMode: this.vatMode,
      vatRateBp: this.vatRateBp,
      subtotalSatang: this.subtotalSatang,
      discountSatang: this.discountSatang,
      vatSatang: this.vatSatang,
      totalSatang: this.totalSatang,
      status: this.status,
      qrReference: this.qrReference,
      saleId: this.saleId,
      createdById: this.createdById,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
    }
  }

  private change(changes: Partial<PriceQuoteProps>): PriceQuoteEntity {
    return new PriceQuoteEntity({ ...this.toSnapshot(), ...changes })
  }
}
