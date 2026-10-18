import { DomainError } from './errors/domain-error'
import { VAT_MODES, type VatMode } from './pricing'

export const LOCALES = ['th', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** Widths of thermal paper a receipt can be laid out for, in millimetres. */
export const RECEIPT_PAPER_WIDTHS = [58, 80] as const
export type ReceiptPaperMm = (typeof RECEIPT_PAPER_WIDTHS)[number]

/** What the sell screen opens on: the till itself, or the floor plan of tables. */
export const HOME_VIEWS = ['till', 'tables'] as const
export type HomeView = (typeof HOME_VIEWS)[number]

/** How a PromptPay payment is taken: through the bank's QR API, or a static QR the shop configured itself. */
export const PROMPTPAY_MODES = ['bank', 'static'] as const
export type PromptPayMode = (typeof PROMPTPAY_MODES)[number]

/** A PromptPay identifier: a 10-digit mobile number starting with 0, or a 13-digit citizen id. */
export function isPromptPayTarget(value: string): boolean {
  return /^\d+$/.test(value) && (value.length === 13 || (value.length === 10 && value.startsWith('0')))
}

/** The kinds of shop first-run setup asks about. Only the features they turn on are stored, not the type. */
export const SHOP_TYPES = ['cafe', 'restaurant', 'retail', 'other'] as const
export type ShopType = (typeof SHOP_TYPES)[number]

export interface ShopFeatures {
  tablesEnabled: boolean
  kitchenEnabled: boolean
  modifiersEnabled: boolean
  homeView: HomeView
}

const FEATURES_BY_SHOP_TYPE: Record<ShopType, ShopFeatures> = {
  cafe: { tablesEnabled: false, kitchenEnabled: false, modifiersEnabled: true, homeView: 'till' },
  restaurant: { tablesEnabled: true, kitchenEnabled: true, modifiersEnabled: true, homeView: 'tables' },
  retail: { tablesEnabled: false, kitchenEnabled: false, modifiersEnabled: false, homeView: 'till' },
  other: { tablesEnabled: true, kitchenEnabled: true, modifiersEnabled: true, homeView: 'till' },
}

/** What a new shop of this type starts with. The owner can switch each feature later. */
export function shopFeaturesFor(type: ShopType): ShopFeatures {
  return { ...FEATURES_BY_SHOP_TYPE[type] }
}

export interface ShopSettingsProps {
  shopName: string
  /** Tax identification number printed on receipts. */
  taxId: string | null
  address: string | null
  phone: string | null
  /** ISO 4217 code. Amounts are stored in the currency's minor unit. */
  currency: string
  vatMode: VatMode
  /** Basis points: 700 = 7%. Ignored when vatMode is "none". */
  vatRateBp: number
  /** IANA time zone; decides where a business day, and its receipt numbering, starts. */
  timeZone: string
  locale: Locale
  receiptPaperMm: ReceiptPaperMm
  /** Printed under every receipt, such as a thank-you line or the return policy. */
  receiptFooter: string | null
  homeView: HomeView
  /**
   * Whether the web shows tables, the kitchen and modifier management. They only hide screens:
   * the API keeps accepting everything, and switching one off deletes nothing.
   */
  tablesEnabled: boolean
  kitchenEnabled: boolean
  modifiersEnabled: boolean
  /** How a PromptPay payment is taken; 'bank' keeps the current behaviour. */
  promptpayMode: PromptPayMode
  /** The shop's own PromptPay identifier for static QR; null means it is not set up. */
  promptpayTarget: string | null
}

/** What a shop that has never been configured runs with. */
export const DEFAULT_SHOP_SETTINGS: ShopSettingsProps = {
  shopName: 'TillumiPOS',
  taxId: null,
  address: null,
  phone: null,
  currency: 'THB',
  vatMode: 'inclusive',
  vatRateBp: 700,
  timeZone: 'Asia/Bangkok',
  locale: 'th',
  receiptPaperMm: 80,
  receiptFooter: null,
  homeView: 'till',
  tablesEnabled: true,
  kitchenEnabled: true,
  modifiersEnabled: true,
  promptpayMode: 'bank',
  promptpayTarget: null,
}

export type ShopSettingsChanges = Partial<ShopSettingsProps>

const invalid = (message: string) => new DomainError(message, 'INVALID_SHOP_SETTINGS')
const within = (value: string | null, max: number) => value === null || value.length <= max

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export class ShopSettingsEntity {
  public readonly shopName: string
  public readonly taxId: string | null
  public readonly address: string | null
  public readonly phone: string | null
  public readonly currency: string
  public readonly vatMode: VatMode
  public readonly vatRateBp: number
  public readonly timeZone: string
  public readonly locale: Locale
  public readonly receiptPaperMm: ReceiptPaperMm
  public readonly receiptFooter: string | null
  public readonly homeView: HomeView
  public readonly tablesEnabled: boolean
  public readonly kitchenEnabled: boolean
  public readonly modifiersEnabled: boolean
  public readonly promptpayMode: PromptPayMode
  public readonly promptpayTarget: string | null

  constructor(props: ShopSettingsProps) {
    if (props.shopName.length < 1 || props.shopName.length > 100) throw invalid('ชื่อร้านต้องยาว 1 ถึง 100 ตัวอักษร')
    if (!within(props.taxId, 20)) throw invalid('เลขประจำตัวผู้เสียภาษีต้องไม่เกิน 20 ตัวอักษร')
    if (!within(props.address, 300)) throw invalid('ที่อยู่ต้องไม่เกิน 300 ตัวอักษร')
    if (!within(props.phone, 30)) throw invalid('เบอร์โทรต้องไม่เกิน 30 ตัวอักษร')
    if (!/^[A-Z]{3}$/.test(props.currency)) throw invalid('รหัสสกุลเงินต้องเป็นตัวอักษรใหญ่ 3 ตัว เช่น THB')
    if (!VAT_MODES.includes(props.vatMode)) throw invalid('วิธีคิดภาษีไม่ถูกต้อง')
    if (!Number.isInteger(props.vatRateBp) || props.vatRateBp < 0 || props.vatRateBp > 10_000)
      throw invalid('อัตราภาษีต้องเป็นจำนวนเต็ม 0 ถึง 10000 (700 = 7%)')
    if (!isTimeZone(props.timeZone)) throw invalid('เขตเวลาไม่ถูกต้อง')
    if (!LOCALES.includes(props.locale)) throw invalid('ภาษาไม่ถูกต้อง')
    if (!RECEIPT_PAPER_WIDTHS.includes(props.receiptPaperMm)) throw invalid('ขนาดกระดาษใบเสร็จต้องเป็น 58 หรือ 80 มม.')
    if (!within(props.receiptFooter, 200)) throw invalid('ข้อความท้ายใบเสร็จต้องไม่เกิน 200 ตัวอักษร')
    if (!HOME_VIEWS.includes(props.homeView)) throw invalid('หน้าแรกต้องเป็นหน้าขายหรือผังโต๊ะ')
    if ([props.tablesEnabled, props.kitchenEnabled, props.modifiersEnabled].some((value) => typeof value !== 'boolean'))
      throw invalid('การเปิดปิดฟีเจอร์ต้องเป็นค่าจริงหรือเท็จ')
    if (!props.tablesEnabled && props.homeView === 'tables')
      throw invalid('ปิดการใช้โต๊ะอยู่ จึงตั้งผังโต๊ะเป็นหน้าแรกไม่ได้')
    if (!PROMPTPAY_MODES.includes(props.promptpayMode)) throw invalid('วิธีรับพร้อมเพย์ไม่ถูกต้อง')
    if (props.promptpayTarget !== null && !isPromptPayTarget(props.promptpayTarget))
      throw invalid('ตัวระบุพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลักขึ้นต้น 0 หรือเลขบัตร 13 หลัก')

    this.shopName = props.shopName
    this.taxId = props.taxId
    this.address = props.address
    this.phone = props.phone
    this.currency = props.currency
    this.vatMode = props.vatMode
    this.vatRateBp = props.vatRateBp
    this.timeZone = props.timeZone
    this.locale = props.locale
    this.receiptPaperMm = props.receiptPaperMm
    this.receiptFooter = props.receiptFooter
    this.homeView = props.homeView
    this.tablesEnabled = props.tablesEnabled
    this.kitchenEnabled = props.kitchenEnabled
    this.modifiersEnabled = props.modifiersEnabled
    this.promptpayMode = props.promptpayMode
    this.promptpayTarget = props.promptpayTarget
  }

  /**
   * A copy with the given fields changed. `undefined` keeps the current value;
   * `null` is a real value for the optional text fields (it clears them).
   */
  with(changes: ShopSettingsChanges): ShopSettingsEntity {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
    return new ShopSettingsEntity({ ...this.toSnapshot(), ...defined })
  }

  /** The rate that actually applies: zero when the shop does not charge VAT. */
  get effectiveVatRateBp(): number {
    return this.vatMode === 'none' ? 0 : this.vatRateBp
  }

  toSnapshot(): ShopSettingsProps {
    return {
      shopName: this.shopName,
      taxId: this.taxId,
      address: this.address,
      phone: this.phone,
      currency: this.currency,
      vatMode: this.vatMode,
      vatRateBp: this.vatRateBp,
      timeZone: this.timeZone,
      locale: this.locale,
      receiptPaperMm: this.receiptPaperMm,
      receiptFooter: this.receiptFooter,
      homeView: this.homeView,
      tablesEnabled: this.tablesEnabled,
      kitchenEnabled: this.kitchenEnabled,
      modifiersEnabled: this.modifiersEnabled,
      promptpayMode: this.promptpayMode,
      promptpayTarget: this.promptpayTarget,
    }
  }
}
