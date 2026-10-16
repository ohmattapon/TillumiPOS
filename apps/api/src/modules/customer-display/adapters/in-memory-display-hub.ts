import { DisplaySessionEntity, targetKey, type DisplayTarget } from '../../../domains/display-session.domain'
import type { DisplayEvent, IDisplayStream } from '../applications/ports/display-stream.port'
import type { IDisplaySessionStore } from '../applications/ports/display-session-store.port'
import type { DisplayEnvelope } from '../applications/schemas/display-schemas'

/**
 * The screens and the last state of each till, in the memory of this process, and the live streams to the
 * screens. One instance serves the whole server. With more than one server process it must be replaced by a
 * shared one (for example Redis pub/sub) behind the same two ports.
 */
export class InMemoryDisplayHub implements IDisplaySessionStore, IDisplayStream {
  private readonly sessions = new Map<string, DisplaySessionEntity>()
  private readonly latest = new Map<string, DisplayEnvelope>()
  private readonly listeners = new Map<string, Set<(event: DisplayEvent) => void>>()

  async add(session: DisplaySessionEntity) {
    this.sessions.set(session.id, session)
  }

  async save(session: DisplaySessionEntity) {
    if (this.sessions.has(session.id)) this.sessions.set(session.id, session)
  }

  async remove(sessionId: string) {
    this.sessions.delete(sessionId)
  }

  async findByToken(token: string) {
    for (const session of this.sessions.values()) if (session.token === token) return session
    return null
  }

  async findWaitingByCode(code: string, now: Date) {
    for (const session of this.sessions.values())
      if (session.status === 'waiting' && session.code === code && !session.isExpired(now)) return session
    return null
  }

  async countWaiting(now: Date) {
    let count = 0
    for (const session of this.sessions.values()) if (session.status === 'waiting' && !session.isExpired(now)) count++
    return count
  }

  async prune(now: Date) {
    for (const [id, session] of this.sessions) if (session.isExpired(now)) this.sessions.delete(id)
  }

  async findPairedTo(target: DisplayTarget) {
    const key = targetKey(target)
    return [...this.sessions.values()].filter((session) => session.target !== null && targetKey(session.target) === key)
  }

  async latestState(target: DisplayTarget) {
    return this.latest.get(targetKey(target)) ?? null
  }

  async setLatestState(target: DisplayTarget, envelope: DisplayEnvelope) {
    this.latest.set(targetKey(target), envelope)
  }

  async clearLatestState(target: DisplayTarget) {
    this.latest.delete(targetKey(target))
  }

  publish(sessionId: string, event: DisplayEvent) {
    for (const listener of this.listeners.get(sessionId) ?? []) listener(event)
  }

  subscribe(sessionId: string, listener: (event: DisplayEvent) => void) {
    const set = this.listeners.get(sessionId) ?? new Set()
    set.add(listener)
    this.listeners.set(sessionId, set)
    return () => {
      set.delete(listener)
      if (set.size === 0) this.listeners.delete(sessionId)
    }
  }
}
