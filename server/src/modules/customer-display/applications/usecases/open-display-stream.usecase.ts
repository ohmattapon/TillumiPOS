import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import { displaySessionStoreToken, type IDisplaySessionStore } from '../ports/display-session-store.port'
import { displayStreamToken, type DisplayEvent, type IDisplayStream } from '../ports/display-stream.port'
import { displayTokenSchema } from '../schemas/display-schemas'

/** How often an idle stream says it is still there. */
export const PING_MS = 20_000


/**
 * Query: the stream a screen listens to. It says where the screen stands (the code to type, or the sale on
 * the counter), then what changes, and pings while quiet. It ends when the screen is let go or its code ran out.
 * Nothing is written: listening only registers the connection.
 */
@injectable()
export class OpenDisplayStreamUseCase {
  constructor(
    @inject(displaySessionStoreToken) private readonly store: IDisplaySessionStore,
    @inject(displayStreamToken) private readonly stream: IDisplayStream,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async *execute(input: unknown, signal?: AbortSignal, pingMs = PING_MS): AsyncGenerator<DisplayEvent> {
    const token = displayTokenSchema.parse(input)
    const session = await this.store.findByToken(token)
    if (!session) throw new DomainNotFoundError('ไม่พบจอนี้ กรุณาเปิดหน้าจอลูกค้าใหม่', 'DISPLAY_SESSION_NOT_FOUND')

    // Subscribed before anything is said, so an event that arrives while the first ones are sent is not lost.
    const queue: DisplayEvent[] = []
    let wake: (() => void) | null = null
    const unsubscribe = this.stream.subscribe(session.id, (event) => {
      queue.push(event)
      wake?.()
    })

    try {
      if (session.status === 'waiting') {
        if (session.isExpired(this.clock.now())) {
          yield { type: 'expired' }
          return
        }
        yield { type: 'waiting', code: session.code, expiresAt: session.expiresAt.toISOString() }
      } else {
        yield { type: 'paired' }
        const latest = await this.store.latestState(session.target!)
        if (latest) yield { type: 'state', envelope: latest }
      }

      let waitingUntil = session.status === 'waiting' ? session.expiresAt.getTime() : null
      while (!signal?.aborted) {
        if (queue.length === 0) {
          const untilExpiry = waitingUntil === null ? pingMs : Math.max(0, waitingUntil - this.clock.now().getTime())
          const timer: { id?: ReturnType<typeof setTimeout> } = {}
          const timedOut = await new Promise<boolean>((resolve) => {
            wake = () => resolve(false)
            signal?.addEventListener('abort', () => resolve(false), { once: true })
            timer.id = setTimeout(() => resolve(true), Math.min(pingMs, untilExpiry))
          })
          clearTimeout(timer.id)
          wake = null
          if (timedOut && queue.length === 0) {
            if (waitingUntil !== null && this.clock.now().getTime() >= waitingUntil) {
              yield { type: 'expired' }
              return
            }
            yield { type: 'ping' }
          }
        }
        while (queue.length > 0) {
          const event = queue.shift()!
          if (event.type === 'paired') waitingUntil = null
          yield event
          if (event.type === 'unpaired' || event.type === 'expired') return
        }
      }
    } finally {
      unsubscribe()
    }
  }
}
