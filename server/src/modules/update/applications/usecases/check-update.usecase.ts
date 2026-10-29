import { inject, injectable } from 'tsyringe'
import { APP_VERSION, compareVersions } from '../../../../domains/update-version'
import { updateChannelToken, type IUpdateChannel } from '../ports/update-channel.port'
import { updateFeedToken, type IUpdateFeed, type UpdateStatus } from '../ports/update-feed.port'

/** Query: this build beside the newest published release. No side effects. */
@injectable()
export class CheckUpdateUseCase {
  constructor(
    @inject(updateFeedToken) private readonly feed: IUpdateFeed,
    @inject(updateChannelToken) private readonly channel: IUpdateChannel,
  ) {}

  async execute(): Promise<UpdateStatus> {
    // An install that cannot apply updates never asks the feed: no network call, no error to show.
    if (!this.channel.isEnabled())
      return { supported: false, currentVersion: APP_VERSION, latestVersion: null, updateAvailable: false }

    const release = await this.feed.fetchFeed()
    // A feed older than this build is not an update: there is no downgrade path.
    return {
      supported: true,
      currentVersion: APP_VERSION,
      latestVersion: release.version,
      updateAvailable: compareVersions(release.version, APP_VERSION) > 0,
    }
  }
}
