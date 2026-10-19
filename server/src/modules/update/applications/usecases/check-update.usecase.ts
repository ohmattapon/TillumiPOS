import { inject, injectable } from 'tsyringe'
import { APP_VERSION, compareVersions } from '../../../../domains/update-version'
import { updateFeedToken, type IUpdateFeed, type UpdateStatus } from '../ports/update-feed.port'

/** Query: this build beside the newest published release. No side effects. */
@injectable()
export class CheckUpdateUseCase {
  constructor(@inject(updateFeedToken) private readonly feed: IUpdateFeed) {}

  async execute(): Promise<UpdateStatus> {
    const release = await this.feed.fetchFeed()
    // A feed older than this build is not an update: there is no downgrade path.
    return {
      currentVersion: APP_VERSION,
      latestVersion: release.version,
      updateAvailable: compareVersions(release.version, APP_VERSION) > 0,
    }
  }
}
