/** The time zones for the shop's select; the shop's own zone is kept first if the browser does not list it. */
export function timeZoneOptions(current: string, known: readonly string[] = Intl.supportedValuesOf('timeZone')): string[] {
  return known.includes(current) ? [...known] : [current, ...known]
}

/** Names a currency code in the shop's language, or gives the code back when the browser has no name for it. */
export function currencyNameIn(locale: string): (code: string) => string {
  const names = new Intl.DisplayNames(locale, { type: 'currency' })
  return (code) => names.of(code) ?? code
}
