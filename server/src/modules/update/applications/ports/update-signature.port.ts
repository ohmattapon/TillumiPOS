/**
 * Checks that a release was signed by the shop software's publisher. The hash in the feed only
 * proves the file arrived intact; the signature proves who published it, so a hijacked release
 * account cannot ship its own package with a matching hash.
 *
 * Answers false for a signature that does not match. Throws UPDATE_SIGNING_NOT_CONFIGURED when this
 * build carries no publisher key: an updater that cannot verify refuses, it never skips the check.
 */
export interface IUpdateSignatureVerifier {
  verify(message: string, signatureBase64: string): boolean
}

const updateSignatureVerifierTokenSymbol: unique symbol = Symbol('IUpdateSignatureVerifier')
export const updateSignatureVerifierToken = updateSignatureVerifierTokenSymbol.toString()
