import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import type { LineOption } from './modifier.domain'
import { calculateTotals, type VatMode } from './pricing'
import type { ProductEntity } from './product.domain'
import { assertPackHasNoOptions, packUnitCostSatang } from './product-pack'

export const PAYMENT_METHODS = ['cash', 'promptpay', 'card'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const SALE_STATUSES = ['completed', 'voided'] as const
export type SaleStatus = (typeof SALE_STATUSES)[number]

/** One receipt line. Name, SKU, price and cost are snapshots, so later product edits never change a receipt. */
export interface SaleItem {
  productId: number
  productName: string
  sku: string
  /** What one unit was sold for: the product's price plus the options chosen. */
  unitPriceSatang: number
  /** What one unit cost: the product's cost plus the cost of the options chosen. */
  unitCostSatang: number
  quantity: number
  lineTotalSatang: number
  /** The pack sold, when the line is packs: its id, or null when the pack record is gone. */
  packId: number | null
  /** Pieces in one pack; 1 on a piece line. */
  packSize: number
  /** The options chosen, as they were. Their price and cost are already in the unit price and cost. */
  options: LineOption[]
}

export interface SalePayment {
  method: PaymentMethod
  amountSatang: number
}

/**
 * What the heading of the receipt said when the sale was made, kept so an old receipt never changes
 * when the shop is renamed or a branch moves. All null on sales recorded before this was kept.
 */
export interface SaleSeller {
  shopName: string | null
  shopTaxId: string | null
  branchName: string | null
  /** The address and phone the receipt prints: the branch's own, or the shop's where the branch has none. */
  shopAddress: string | null
  shopPhone: string | null
}

const UNKNOWN_SELLER: SaleSeller = { shopName: null, shopTaxId: null, branchName: null, shopAddress: null, shopPhone: null }

export interface SaleMember {
  id: number
  code: string
  name: string
}

const copyMember = (member?: SaleMember | null): SaleMember | null =>
  member ? { id: member.id, code: member.code, name: member.name } : null

/**
 * The promotion a sale was given, as it was when sold, kept so editing or closing the promotion later
 * never changes an old receipt. `value` is satang for `fixed` and basis points for `percent`.
 */
export interface SalePromotion {
  id: number
  name: string
  kind: 'fixed' | 'percent'
  value: number
  maxDiscountSatang: number | null
  discountSatang: number
}

const copyPromotion = (promotion?: SalePromotion | null): SalePromotion | null =>
  promotion
    ? {
        id: promotion.id,
        name: promotion.name,
        kind: promotion.kind,
        value: promotion.value,
        maxDiscountSatang: promotion.maxDiscountSatang,
        discountSatang: promotion.discountSatang,
      }
    : null

interface SaleTotals {
  subtotalSatang: number
  discountSatang: number
  totalSatang: number
  /** VAT contained in totalSatang (prices include VAT). */
  vatSatang: number
  paidSatang: number
  changeSatang: number
}

/** A priced and settled sale that has not been stored yet: it has no id, receipt number or timestamp. */
export interface NewSale extends SaleTotals, SaleSeller {
  member?: SaleMember | null
  promotion?: SalePromotion | null
  /** How VAT was applied to this sale, kept so the receipt never changes when the shop settings do. */
  vatMode: VatMode
  /** The rate in basis points that was applied; 0 when no VAT was charged. */
  vatRateBp: number
  /** The branch that made the sale; its stock is the one that changes. */
  branchId: number
  /** Shift recorded by API v2; legacy v1 sales keep this null. */
  shiftId?: number | null
  cashierId: number
  cashierName: string
  items: SaleItem[]
  payments: SalePayment[]
}

export interface SaleEntityProps extends NewSale {
  id: number
  receiptNo: string
  status: SaleStatus
  voidedById: number | null
  voidedAt: Date | null
  voidReason: string | null
  createdAt: Date
}

export interface CompleteSaleInput {
  member?: SaleMember | null
  promotion?: SalePromotion | null
  lines: {
    product: ProductEntity
    quantity: number
    options?: readonly LineOption[]
    /** The pack sold: quantity counts packs, options must be empty. Undefined sells pieces. */
    pack?: { id: number | null; size: number; unitPriceSatang: number }
  }[]
  discountSatang: number
  payments: SalePayment[]
  vatMode: VatMode
  /** VAT rate in basis points (700 = 7%). */
  vatRateBp: number
  branchId: number
  shiftId?: number | null
  cashier: { id: number; displayName: string }
  seller?: SaleSeller
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** Largest amount the system stores: the ceiling of a 32-bit integer of satang, about 21.4 million baht. */
export const MAX_AMOUNT_SATANG = 2_147_483_647
const tooLarge = () => new DomainError('ยอดเงินเกินกว่าที่ระบบรองรับ', 'AMOUNT_TOO_LARGE')
const isWholeAmount = (value: number) => Number.isInteger(value) && value >= 0

/**
 * A sale and its lines and payments. A sale is never edited or deleted:
 * the only change it can go through is being voided, once.
 */
export class SaleEntity {
  public readonly member: Readonly<SaleMember> | null
  public readonly promotion: Readonly<SalePromotion> | null
  public readonly id: number
  public readonly receiptNo: string
  public readonly status: SaleStatus
  public readonly subtotalSatang: number
  public readonly discountSatang: number
  public readonly totalSatang: number
  public readonly vatSatang: number
  public readonly paidSatang: number
  public readonly changeSatang: number
  public readonly vatMode: VatMode
  public readonly vatRateBp: number
  public readonly branchId: number
  public readonly shiftId: number | null
  public readonly cashierId: number
  public readonly cashierName: string
  public readonly shopName: string | null
  public readonly shopTaxId: string | null
  public readonly branchName: string | null
  public readonly shopAddress: string | null
  public readonly shopPhone: string | null
  public readonly voidedById: number | null
  public readonly voidedAt: Date | null
  public readonly voidReason: string | null
  public readonly createdAt: Date
  public readonly items: readonly SaleItem[]
  public readonly payments: readonly SalePayment[]

  constructor(props: SaleEntityProps) {
    if (!SALE_STATUSES.includes(props.status)) throw new DomainError('สถานะของบิลไม่ถูกต้อง', 'INVALID_SALE')
    if (props.status === 'voided' && !props.voidedAt)
      throw new DomainError('บิลที่ยกเลิกต้องมีเวลาที่ยกเลิก', 'INVALID_SALE')

    this.member = props.member ? Object.freeze(copyMember(props.member)!) : null
    // `?? null`: a sale restored from a snapshot stored before promotions were kept has none.
    this.promotion = props.promotion ? Object.freeze(copyPromotion(props.promotion)!) : null
    this.id = props.id
    this.receiptNo = props.receiptNo
    this.status = props.status
    this.subtotalSatang = props.subtotalSatang
    this.discountSatang = props.discountSatang
    this.totalSatang = props.totalSatang
    this.vatSatang = props.vatSatang
    this.paidSatang = props.paidSatang
    this.changeSatang = props.changeSatang
    this.vatMode = props.vatMode
    this.vatRateBp = props.vatRateBp
    this.branchId = props.branchId
    this.shiftId = props.shiftId ?? null
    this.cashierId = props.cashierId
    this.cashierName = props.cashierName
    // `?? null`: a sale restored from a snapshot stored before these were kept has none of them.
    this.shopName = props.shopName ?? null
    this.shopTaxId = props.shopTaxId ?? null
    this.branchName = props.branchName ?? null
    this.shopAddress = props.shopAddress ?? null
    this.shopPhone = props.shopPhone ?? null
    this.voidedById = props.voidedById
    this.voidedAt = props.voidedAt
    this.voidReason = props.voidReason
    this.createdAt = props.createdAt
    // `??` fallbacks: a sale restored from a snapshot stored before packs or options were kept
    // has none of them on its lines; every older line was pieces.
    this.items = props.items.map((item) => ({ ...item, packId: item.packId ?? null, packSize: item.packSize ?? 1, options: item.options ?? [] }))
    this.payments = props.payments
  }

  /**
   * Prices and settles a sale. All amounts are integer satang. Prices include VAT,
   * so VAT is extracted from the discounted total rather than added on top.
   */
  static complete({ lines, discountSatang, payments, vatMode, vatRateBp, branchId, shiftId, cashier, seller, member, promotion }: CompleteSaleInput): NewSale {
    if (lines.length === 0) throw new DomainError('บิลต้องมีสินค้าอย่างน้อย 1 รายการ', 'EMPTY_SALE')
    if (lines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1))
      throw new DomainError('จำนวนสินค้าต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป', 'INVALID_QUANTITY')
    if (!isWholeAmount(discountSatang)) throw new DomainError('ส่วนลดต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ', 'INVALID_DISCOUNT')
    if (promotion && promotion.discountSatang !== discountSatang)
      throw new DomainError('ส่วนลดไม่ตรงกับโปรโมชันที่ใช้', 'INVALID_DISCOUNT')
    if (payments.some((payment) => !isWholeAmount(payment.amountSatang) || payment.amountSatang < 1))
      throw new DomainError('ยอดชำระแต่ละรายการต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1 ขึ้นไป', 'INVALID_PAYMENT')

    const items: SaleItem[] = lines.map(({ product, quantity, options = [], pack }) => {
      // A pack line is priced by the pack: the size times pieces leave through stock, never options.
      if (pack !== undefined) {
        assertPackHasNoOptions(true, options.length)
        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unitPriceSatang: pack.unitPriceSatang,
          unitCostSatang: packUnitCostSatang(product.costSatang, pack.size),
          quantity,
          lineTotalSatang: pack.unitPriceSatang * quantity,
          packId: pack.id,
          packSize: pack.size,
          options: [],
        }
      }
      const unitPriceSatang = product.priceSatang + sum(options.map((option) => option.priceSatang))
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPriceSatang,
        unitCostSatang: product.costSatang + sum(options.map((option) => option.costSatang)),
        quantity,
        lineTotalSatang: unitPriceSatang * quantity,
        packId: null,
        packSize: 1,
        options: [...options],
      }
    })

    const subtotalSatang = sum(items.map((item) => item.lineTotalSatang))
    if (subtotalSatang > MAX_AMOUNT_SATANG) throw tooLarge()
    if (discountSatang > subtotalSatang) throw new DomainError('ส่วนลดมากกว่ายอดรวมสินค้า', 'DISCOUNT_TOO_LARGE')
    const { vatSatang, totalSatang } = calculateTotals({ subtotalSatang, discountSatang, vatMode, vatRateBp })
    // Exclusive VAT is added on top, so the total can pass the ceiling even when the subtotal did not.
    if (totalSatang > MAX_AMOUNT_SATANG) throw tooLarge()

    const paidSatang = sum(payments.map((payment) => payment.amountSatang))
    if (paidSatang > MAX_AMOUNT_SATANG) throw tooLarge()
    if (paidSatang < totalSatang) throw new DomainError('ยอดชำระไม่ครบ', 'UNDERPAID')
    const changeSatang = paidSatang - totalSatang
    const cashSatang = sum(payments.filter((payment) => payment.method === 'cash').map((payment) => payment.amountSatang))
    // Change can only come out of the cash drawer.
    if (changeSatang > cashSatang) throw new DomainError('ยอดชำระที่ไม่ใช่เงินสดเกินยอดที่ต้องจ่าย', 'OVERPAID')

    return {
      member: copyMember(member),
      promotion: copyPromotion(promotion),
      subtotalSatang,
      discountSatang,
      totalSatang,
      vatSatang,
      paidSatang,
      changeSatang,
      vatMode,
      vatRateBp: vatMode === 'none' ? 0 : vatRateBp,
      branchId,
      shiftId: shiftId ?? null,
      cashierId: cashier.id,
      cashierName: cashier.displayName,
      ...(seller ?? UNKNOWN_SELLER),
      items,
      payments: payments.map(({ method, amountSatang }) => ({ method, amountSatang })),
    }
  }

  /** The voided version of this sale. A sale can be voided only once. */
  void(reason: string, voidedById: number, at: Date): SaleEntity {
    if (this.status === 'voided') throw new DomainConflictError('บิลนี้ถูกยกเลิกไปแล้ว', 'ALREADY_VOIDED')
    if (reason.length < 1 || reason.length > 500)
      throw new DomainError('เหตุผลที่ยกเลิกต้องยาว 1 ถึง 500 ตัวอักษร', 'INVALID_VOID_REASON')

    return new SaleEntity({ ...this.toSnapshot(), status: 'voided', voidedById, voidedAt: at, voidReason: reason })
  }

  toSnapshot(): SaleEntityProps & { member: SaleMember | null; promotion: SalePromotion | null } {
    return {
      member: copyMember(this.member),
      promotion: copyPromotion(this.promotion),
      id: this.id,
      receiptNo: this.receiptNo,
      status: this.status,
      subtotalSatang: this.subtotalSatang,
      discountSatang: this.discountSatang,
      totalSatang: this.totalSatang,
      vatSatang: this.vatSatang,
      paidSatang: this.paidSatang,
      changeSatang: this.changeSatang,
      vatMode: this.vatMode,
      vatRateBp: this.vatRateBp,
      branchId: this.branchId,
      shiftId: this.shiftId,
      cashierId: this.cashierId,
      cashierName: this.cashierName,
      shopName: this.shopName,
      shopTaxId: this.shopTaxId,
      branchName: this.branchName,
      shopAddress: this.shopAddress,
      shopPhone: this.shopPhone,
      voidedById: this.voidedById,
      voidedAt: this.voidedAt,
      voidReason: this.voidReason,
      createdAt: this.createdAt,
      items: this.items.map((item) => ({ ...item })),
      payments: this.payments.map((payment) => ({ ...payment })),
    }
  }
}
