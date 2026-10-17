import { inject, injectable } from 'tsyringe'
import { targetOf, type DisplayActor } from '../display-actor'
import { displaySessionStoreToken, type IDisplaySessionStore } from '../ports/display-session-store.port'
import { displayStreamToken, type IDisplayStream } from '../ports/display-stream.port'
import { displayTargetInputSchema } from '../schemas/display-schemas'

/** Command: the till lets go of its screens. They are told, and forgotten. */
@injectable()
export class UnpairDisplayUseCase {
  constructor(
    @inject(displaySessionStoreToken) private readonly store: IDisplaySessionStore,
    @inject(displayStreamToken) private readonly stream: IDisplayStream,
  ) {}

  async execute(input: unknown, actor: DisplayActor) {
    const dto = displayTargetInputSchema.parse(input)
    const target = targetOf(actor, dto.registerId)
    const screens = await this.store.findPairedTo(target)
    for (const screen of screens) {
      this.stream.publish(screen.id, { type: 'unpaired' })
      await this.store.remove(screen.id)
    }
    await this.store.clearLatestState(target)
    return { displays: screens.length }
  }
}
