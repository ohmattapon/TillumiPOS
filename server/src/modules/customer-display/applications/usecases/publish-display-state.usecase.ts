import { inject, injectable } from 'tsyringe'
import { targetOf, type DisplayActor } from '../display-actor'
import { displaySessionStoreToken, type IDisplaySessionStore } from '../ports/display-session-store.port'
import { displayStreamToken, type IDisplayStream } from '../ports/display-stream.port'
import { publishDisplayStateSchema } from '../schemas/display-schemas'

/** Command: the till says what is on the counter; every screen that follows it is told. */
@injectable()
export class PublishDisplayStateUseCase {
  constructor(
    @inject(displaySessionStoreToken) private readonly store: IDisplaySessionStore,
    @inject(displayStreamToken) private readonly stream: IDisplayStream,
  ) {}

  async execute(input: unknown, actor: DisplayActor) {
    const dto = publishDisplayStateSchema.parse(input)
    const target = targetOf(actor, dto.registerId)
    await this.store.setLatestState(target, dto.envelope)
    const screens = await this.store.findPairedTo(target)
    for (const screen of screens) this.stream.publish(screen.id, { type: 'state', envelope: dto.envelope })
    return { displays: screens.length }
  }
}
