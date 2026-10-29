/**
 * Hashes bytes with SHA-256 and answers lowercase hex. A port because the core
 * never touches crypto directly; the comparison against the feed's signature
 * stays in the use case, where it is a business rule, not transport detail.
 */
export interface IUpdateHasher {
  sha256Hex(data: Uint8Array): string
}

const updateHasherTokenSymbol: unique symbol = Symbol('IUpdateHasher')
export const updateHasherToken = updateHasherTokenSymbol.toString()
