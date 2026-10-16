import { inject, injectable } from 'tsyringe'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import { targetOf, type DisplayActor } from '../display-actor'
import { displaySessionStoreToken, type IDisplaySessionStore } from '../ports/display-session-store.port'
import { displayStreamToken, type IDisplayStream } from '../ports/display-stream.port'
import { pairingGuardToken, type IPairingGuard } from '../ports/pairing-guard.port'
import { pairDisplaySchema } from '../schemas/display-schemas'

/**
 * Command: the cashier types the code shown on a screen, and that screen follows this till from then on. Wrong
 * codes are counted per person, because a six-digit code is short enough to be guessed by trying.
 */
@injectable()
export class PairDisplayUseCase {
  constructor(
    @inject(displaySessionStoreToken) private readonly store: IDisplaySessionStore,
    @inject(displayStreamToken) private readonly stream: IDisplayStream,
    @inject(pairingGuardToken) private readonly guard: IPairingGuard,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async execute(input: unknown, actor: DisplayActor) {
    const dto = pairDisplaySchema.parse(input)
    if (this.guard.check(actor.userId) === 'locked')
      throw new DomainForbiddenError('กรอกรหัสจับคู่ผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่', 'DISPLAY_PAIRING_LOCKED')

    const now = this.clock.now()
    const waiting = await this.store.findWaitingByCode(dto.code, now)
    if (!waiting) {
      this.guard.recordFailure(actor.userId)
      throw new DomainNotFoundError('ไม่พบจอที่ใช้รหัสนี้ รหัสอาจหมดอายุแล้ว', 'DISPLAY_CODE_NOT_FOUND')
    }
    this.guard.recordSuccess(actor.userId)

    const target = targetOf(actor, dto.registerId)
    await this.store.save(waiting.pair(target, now))
    this.stream.publish(waiting.id, { type: 'paired' })
    // A screen that joins late is not left on the idle screen until the till speaks again.
    const latest = await this.store.latestState(target)
    if (latest) this.stream.publish(waiting.id, { type: 'state', envelope: latest })
    return { displays: (await this.store.findPairedTo(target)).length }
  }
}
