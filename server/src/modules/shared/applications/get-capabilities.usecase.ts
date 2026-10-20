import { inject, injectable } from 'tsyringe'
import { TOKENS } from '../../tokens'
import type { ICheckoutPolicy } from '../ports/checkout-policy.port'
import type { IMediaStorage } from '../ports/media-storage.port'

/** Query: what this installation can do, so the web shows only the screens that will work. */
@injectable()
export class GetCapabilitiesUseCase {
  constructor(
    @inject(TOKENS.CheckoutPolicy) private readonly policy: ICheckoutPolicy,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
  ) {}

  async execute() {
    return {
      checkoutMode: (await this.policy.isShiftsEnabled()) ? ('shifts' as const) : ('legacy' as const),
      imageStorage: this.media.isEnabled() ? ('enabled' as const) : ('disabled' as const),
    }
  }
}
