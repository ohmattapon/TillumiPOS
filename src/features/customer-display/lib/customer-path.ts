/**
 * Whether a path is the customer's screen. Paths are case-insensitive here, so /Customer opens the screen too,
 * and a trailing slash is ignored. Nothing else counts: /customers and /customer/extra are the staff app.
 */
export function isCustomerScreenPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '').toLowerCase() === '/customer'
}
