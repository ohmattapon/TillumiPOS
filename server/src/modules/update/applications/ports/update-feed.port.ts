/** One published release, exactly as the update feed describes it. */
export interface UpdateRelease {
  version: string
  sha256: string
  url: string
}

/** What the settings screen shows: this build beside the newest published release. */
export interface UpdateStatus {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
}

/**
 * The single place the shop learns about new releases. The implementation reads
 * a FIXED feed URL constant: a release URL the client could supply would turn
 * the updater into an arbitrary-code hole, so the feed is never client input.
 * Throws UPDATE_FEED_UNAVAILABLE when it cannot be reached, UPDATE_FEED_INVALID
 * when it answers with a wrong shape.
 */
export interface IUpdateFeed {
  fetchFeed(): Promise<UpdateRelease>
}

const updateFeedTokenSymbol: unique symbol = Symbol('IUpdateFeed')
export const updateFeedToken = updateFeedTokenSymbol.toString()
