export const PAYMENT_METHODS = ['cash', 'promptpay', 'card'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export type Locale = 'th' | 'en'

/** One payment of a sale. A QR payment carries the id of the QR the bank confirmed. */
export interface PaymentInput {
  method: PaymentMethod
  amountSatang: number
  qrPaymentId?: number
}

// Numbers and dates follow the language of the shop. Thai uses the Buddhist calendar year.
const INTL_LOCALE: Record<Locale, string> = { th: 'th-TH', en: 'en-US' }

/**
 * Money is stored and sent as integers in the currency's minor unit (satang, cents, ...).
 * Only the screen converts to and from what a person reads and types.
 */
export interface Money {
  currency: string
  /** Digits after the decimal point in the minor unit: 2 for THB and USD, 0 for JPY. */
  fractionDigits: number
  /** With the currency symbol: "฿1,250.00". */
  format(minor: number): string
  /** Without it, for table cells and receipts where the currency is already clear: "1,250.00". */
  plain(minor: number): string
  /** Reads what a person typed ("1,250.5") into minor units; null unless it is a valid non-negative amount. */
  parse(input: string): number | null
  /** The amount as a person would type it into a field: 125000 becomes "1250". */
  toInput(minor: number): string
}

export function createMoney(currency: string, locale: Locale): Money {
  const intlLocale = INTL_LOCALE[locale]
  const withSymbol = new Intl.NumberFormat(intlLocale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
  const fractionDigits = withSymbol.resolvedOptions().maximumFractionDigits ?? 2
  const factor = 10 ** fractionDigits
  const plain = new Intl.NumberFormat(intlLocale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

  return {
    currency,
    fractionDigits,
    format: (minor) => withSymbol.format(minor / factor),
    plain: (minor) => plain.format(minor / factor),
    parse(input) {
      const text = input.trim().replaceAll(',', '')
      const value = Number(text)
      if (text === '' || !Number.isFinite(value) || value < 0) return null
      return Math.round(value * factor)
    },
    toInput: (minor) => String(minor / factor),
  }
}

export interface DateFormat {
  dateTime(value: Date | string): string
  time(value: Date | string): string
  longDate(value: Date | string): string
  calendarDate(value: string): string
  calendarYear(value: string): string
}

export function createDateFormat(locale: Locale): DateFormat {
  const intlLocale = INTL_LOCALE[locale]
  const dateTime = new Intl.DateTimeFormat(intlLocale, { dateStyle: 'short', timeStyle: 'short' })
  const time = new Intl.DateTimeFormat(intlLocale, { timeStyle: 'short' })
  const longDate = new Intl.DateTimeFormat(intlLocale, { weekday: 'long', day: 'numeric', month: 'long' })
  const calendarDate = new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const calendarYear = new Intl.DateTimeFormat(intlLocale, { year: 'numeric', timeZone: 'UTC' })

  return {
    dateTime: (value) => dateTime.format(new Date(value)),
    time: (value) => time.format(new Date(value)),
    longDate: (value) => longDate.format(new Date(value)),
    calendarDate: (value) => calendarDate.format(new Date(value)),
    calendarYear: (value) => calendarYear.formatToParts(new Date(value)).find((part) => part.type === 'year')!.value,
  }
}
