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

/** A LAN printer address: an IPv4 address or a local hostname (letters, digits, dots, hyphens). */
export function isPrinterHost(value: string): boolean {
  return value.length >= 1 && value.length <= 45 && /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value)
}

/** The one shape a stored logo key has: `logo/<uuid>.<ext>`. The upload use case produces it; nothing else is accepted. */
export const isLogoKey = (value: string) => /^logo\/[A-Za-z0-9-]{1,64}\.(jpg|png|webp)$/.test(value)

/** The storage key of a new logo: a fresh id per upload lets browsers cache the picture forever. */
export const buildLogoKey = (id: string, extension: string) => `logo/${id}.${extension}`

/** The kinds of shop first-run setup asks about. Only the features they turn on are stored, not the type. */
export const SHOP_TYPES = ['cafe', 'restaurant', 'retail', 'other'] as const
export type ShopType = (typeof SHOP_TYPES)[number]

export interface ShopFeatures {
  tablesEnabled: boolean
  modifiersEnabled: boolean
  homeView: HomeView
}

const FEATURES_BY_SHOP_TYPE: Record<ShopType, ShopFeatures> = {
  cafe: { tablesEnabled: false, modifiersEnabled: true, homeView: 'till' },
  restaurant: { tablesEnabled: true, modifiersEnabled: true, homeView: 'tables' },
  retail: { tablesEnabled: false, modifiersEnabled: false, homeView: 'till' },
  other: { tablesEnabled: true, modifiersEnabled: true, homeView: 'till' },
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
   * Whether the web shows tables and modifier management. They only hide screens:
   * the API keeps accepting everything, and switching one off deletes nothing.
   */
  tablesEnabled: boolean
  modifiersEnabled: boolean
  /** How a PromptPay payment is taken; 'bank' keeps the current behaviour. */
  promptpayMode: PromptPayMode
  /** The shop's own PromptPay identifier for static QR; null means it is not set up. */
  promptpayTarget: string | null
  /** LAN address of the thermal printer; null means it is not set up. */
  receiptPrinterIp: string | null
  /** TCP port the printer listens on; 9100 is the ESC/POS default. */
  receiptPrinterPort: number
  /** Print through the LAN printer instead of the browser. Needs an IP. */
  receiptPrinterEnabled: boolean
  /** Kick the drawer through the printer after printing. Needs the printer on. */
  cashDrawerEnabled: boolean
  /** Storage key of the logo printed at the top of receipts; null means no logo. Changed only by the logo commands. */
  logoKey: string | null
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
  modifiersEnabled: true,
  promptpayMode: 'bank',
  promptpayTarget: null,
  receiptPrinterIp: null,
  receiptPrinterPort: 9100,
  receiptPrinterEnabled: false,
  cashDrawerEnabled: false,
  logoKey: null,
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
  public readonly modifiersEnabled: boolean
  public readonly promptpayMode: PromptPayMode
  public readonly promptpayTarget: string | null
  public readonly receiptPrinterIp: string | null
  public readonly receiptPrinterPort: number
  public readonly receiptPrinterEnabled: boolean
  public readonly cashDrawerEnabled: boolean
  public readonly logoKey: string | null

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
    if ([props.tablesEnabled, props.modifiersEnabled].some((value) => typeof value !== 'boolean'))
      throw invalid('การเปิดปิดฟีเจอร์ต้องเป็นค่าจริงหรือเท็จ')
    if (!props.tablesEnabled && props.homeView === 'tables')
      throw invalid('ปิดการใช้โต๊ะอยู่ จึงตั้งผังโต๊ะเป็นหน้าแรกไม่ได้')
    if (!PROMPTPAY_MODES.includes(props.promptpayMode)) throw invalid('วิธีรับพร้อมเพย์ไม่ถูกต้อง')
    if (props.promptpayTarget !== null && !isPromptPayTarget(props.promptpayTarget))
      throw invalid('ตัวระบุพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลักขึ้นต้น 0 หรือเลขบัตร 13 หลัก')
    if (props.receiptPrinterIp !== null && !isPrinterHost(props.receiptPrinterIp))
      throw invalid('IP เครื่องพิมพ์ต้องเป็นตัวเลข 4 ชุดคั่นจุด หรือชื่อเครื่องในแลน')
    if (!Number.isInteger(props.receiptPrinterPort) || props.receiptPrinterPort < 1 || props.receiptPrinterPort > 65535)
      throw invalid('พอร์ตเครื่องพิมพ์ต้องเป็นจำนวนเต็ม 1 ถึง 65535')
    if (typeof props.receiptPrinterEnabled !== 'boolean' || typeof props.cashDrawerEnabled !== 'boolean')
      throw invalid('การเปิดปิดเครื่องพิมพ์และลิ้นชักต้องเป็นค่าจริงหรือเท็จ')
    if (props.receiptPrinterEnabled && props.receiptPrinterIp === null)
      throw invalid('เปิดพิมพ์ผ่านแลนต้องกรอก IP เครื่องพิมพ์ก่อน')
    if (props.cashDrawerEnabled && !props.receiptPrinterEnabled)
      throw invalid('เปิดลิ้นชักต้องเปิดพิมพ์ผ่านแลนก่อน เพราะลิ้นชักเตะผ่านเครื่องพิมพ์')
    // A shop saved before logos existed has no value at all, which means no logo.
    const logoKey = props.logoKey ?? null
    if (logoKey !== null && !isLogoKey(logoKey)) throw invalid('คีย์โลโก้ไม่ถูกต้อง')

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
    this.modifiersEnabled = props.modifiersEnabled
    this.promptpayMode = props.promptpayMode
    this.promptpayTarget = props.promptpayTarget
    this.receiptPrinterIp = props.receiptPrinterIp
    this.receiptPrinterPort = props.receiptPrinterPort
    this.receiptPrinterEnabled = props.receiptPrinterEnabled
    this.cashDrawerEnabled = props.cashDrawerEnabled
    this.logoKey = logoKey
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
      modifiersEnabled: this.modifiersEnabled,
      promptpayMode: this.promptpayMode,
      promptpayTarget: this.promptpayTarget,
      receiptPrinterIp: this.receiptPrinterIp,
      receiptPrinterPort: this.receiptPrinterPort,
      receiptPrinterEnabled: this.receiptPrinterEnabled,
      cashDrawerEnabled: this.cashDrawerEnabled,
      logoKey: this.logoKey,
    }
  }
}
