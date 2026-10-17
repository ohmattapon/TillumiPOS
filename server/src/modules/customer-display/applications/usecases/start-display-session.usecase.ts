import { inject, injectable } from 'tsyringe'
import { DisplaySessionEntity, MAX_WAITING_SESSIONS } from '../../../../domains/display-session.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import { displaySessionStoreToken, type IDisplaySessionStore } from '../ports/display-session-store.port'
import { displayIdentifiersToken, type IDisplayIdentifiers } from '../ports/pairing-guard.port'

/**
 * Command: a customer's screen asks for a code. Anyone may ask, so the number of screens that wait for a till
 * is capped, and a code is never given to two waiting screens.
 */
@injectable()
export class StartDisplaySessionUseCase {
  constructor(
    @inject(displaySessionStoreToken) private readonly store: IDisplaySessionStore,
    @inject(displayIdentifiersToken) private readonly ids: IDisplayIdentifiers,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async execute() {
    const now = this.clock.now()
    await this.store.prune(now)
    if ((await this.store.countWaiting(now)) >= MAX_WAITING_SESSIONS)
      throw new DomainConflictError('มีจอรอจับคู่มากเกินไป กรุณาลองใหม่ภายหลัง', 'DISPLAY_SESSIONS_FULL')

    let code = this.ids.newCode()
    for (let attempt = 0; attempt < 5 && (await this.store.findWaitingByCode(code, now)); attempt++) code = this.ids.newCode()
    if (await this.store.findWaitingByCode(code, now))
      throw new DomainConflictError('สร้างรหัสจับคู่ไม่สำเร็จ กรุณาลองใหม่', 'DISPLAY_SESSIONS_FULL')

    const session = new DisplaySessionEntity({
      id: this.ids.newId(),
      token: this.ids.newToken(),
      code,
      createdAt: now,
      target: null,
    })
    await this.store.add(session)
    return session
  }
}
