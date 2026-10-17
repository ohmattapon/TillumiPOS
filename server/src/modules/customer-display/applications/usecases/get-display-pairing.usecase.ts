import { inject, injectable } from 'tsyringe'
import { targetOf, type DisplayActor } from '../display-actor'
import { displaySessionStoreToken, type IDisplaySessionStore } from '../ports/display-session-store.port'
import { displayTargetInputSchema } from '../schemas/display-schemas'

/** Query: how many screens follow this till, so the till can say whether it is connected. */
@injectable()
export class GetDisplayPairingUseCase {
  constructor(@inject(displaySessionStoreToken) private readonly store: IDisplaySessionStore) {}

  async execute(input: unknown, actor: DisplayActor) {
    const dto = displayTargetInputSchema.parse(input)
    return { displays: (await this.store.findPairedTo(targetOf(actor, dto.registerId))).length }
  }
}
