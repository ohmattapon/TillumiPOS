// The k6 side's copy of assertLocalBaseUrl (load/lib/safety.ts). k6 cannot import Bun modules and has no reliable URL
// parser, so the rule is a pattern here; load/k6/lib/local-url.test.ts keeps the two in agreement on a table of cases.
// Nothing may be imported into this file: the Bun test loads it directly.

// http only; the host is exactly 127.0.0.1 or localhost; then a port, a path, a query, a fragment or the end. Anything
// else after the host (a user name, a dot, a backslash) is refused, which is stricter than the Bun guard on purpose.
const LOCAL_BASE_URL = /^http:\/\/(127\.0\.0\.1|localhost)(:[0-9]{1,5})?([/?#]|$)/i

export function isLocalBaseUrl(url: string): boolean {
  return LOCAL_BASE_URL.test(url)
}

/** Throws unless the URL is this machine's own address, so a script can never hit a real shop. */
export function assertLocalBaseUrl(url: string): void {
  if (!isLocalBaseUrl(url)) throw new Error('Refusing the BASE_URL: only http://127.0.0.1 or http://localhost is allowed (local base URL rule)')
}
