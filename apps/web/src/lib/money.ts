const baht = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The API speaks integer satang; only the UI converts to and from baht. */
export const formatBaht = (satang: number) => baht.format(satang / 100)

/** Parses a baht amount typed by the user. Returns null when it is not a valid non-negative amount. */
export function parseBaht(input: string): number | null {
  const value = Number(input.trim().replaceAll(',', ''))
  if (input.trim() === '' || !Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

const dateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' })
const time = new Intl.DateTimeFormat('th-TH', { timeStyle: 'short' })
const longDate = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })

export const formatDateTime = (value: Date | string) => dateTime.format(new Date(value))
export const formatTime = (value: Date | string) => time.format(new Date(value))
export const formatLongDate = (value: Date | string) => longDate.format(new Date(value))

export const paymentMethodLabel = { cash: 'เงินสด', promptpay: 'พร้อมเพย์', card: 'บัตร' } as const

export type PaymentMethod = keyof typeof paymentMethodLabel
