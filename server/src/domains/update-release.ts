/**
 * Where release packages may come from. The feed's `url` must start with this, so a feed that
 * names another host is refused even before its signature is looked at.
 */
export const UPDATE_RELEASE_URL_PREFIX = 'https://github.com/ohmattapon/TillumiPOS/releases/download/'

export interface SignedRelease {
  version: string
  sha256: string
  url: string
}

/**
 * The exact text the release signature covers: version, package hash and package URL, so none of
 * the three can be swapped for another while the signature stays valid. `installer/scripts/apply-update.ps1`
 * builds the same text (lines joined by LF); change both together.
 */
export function updateSignedMessage(release: SignedRelease): string {
  return ['tillumi-update:v1', release.version, release.sha256.toLowerCase(), release.url].join('\n')
}
