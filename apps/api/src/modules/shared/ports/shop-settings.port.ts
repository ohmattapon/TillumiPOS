/** Shop-wide business settings. Read from the environment today; a later change can move them to the database. */
export interface IShopSettings {
  /** VAT rate in basis points (700 = 7%). Product prices include VAT. */
  readonly vatRateBp: number
  /** IANA time zone that decides when a business day, and its receipt numbering, starts. */
  readonly timeZone: string
}
