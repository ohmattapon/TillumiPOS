/** The part of the browser's `crypto` that makes a UUID. `randomUUID` is missing where the page is not a secure context. */
type UuidSource = Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>>

/**
 * A random UUID (v4). `crypto.randomUUID` only exists on pages the browser calls secure (https or localhost), so on
 * a tablet that opens the till at http://192.168.x.x it is undefined and calling it breaks the page. Random bytes
 * are available everywhere, so the UUID is built from them when `randomUUID` is not there.
 * Pass the source in a test; the page uses the browser's own.
 */
export function newUuid(source: UuidSource = globalThis.crypto): string {
  if (source.randomUUID) return source.randomUUID()

  const bytes = source.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // the RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
