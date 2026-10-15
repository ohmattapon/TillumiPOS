/**
 * Runs `next` only after `release` has succeeded. A QR is replaced or dropped this way: the old one is
 * cancelled first, so a payment made next never meets its price still reserved by that QR. Resolves to
 * false, and does not run `next`, when the release fails.
 */
export async function runAfterRelease(release: () => Promise<unknown>, next: () => void): Promise<boolean> {
  try {
    await release()
  } catch {
    return false
  }
  next()
  return true
}
