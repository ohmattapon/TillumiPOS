import { describe, expect, test } from 'bun:test'
import { DisplaySessionEntity, PAIRING_CODE_VALID_MS } from '../../../domains/display-session.domain'
import type { DisplayEvent } from '../applications/ports/display-stream.port'
import type { DisplayEnvelope } from '../applications/schemas/display-schemas'
import { CryptoDisplayIdentifiers, InMemoryPairingGuard } from './in-memory-pairing-guard'
import { InMemoryDisplayHub } from './in-memory-display-hub'

const now = new Date('2026-10-16T09:00:00Z')
const after = (ms: number) => new Date(now.getTime() + ms)
const session = (id: string, code: string, overrides: Partial<ConstructorParameters<typeof DisplaySessionEntity>[0]> = {}) =>
  new DisplaySessionEntity({ id, token: `token-${id}`.padEnd(30, 'x'), code, createdAt: now, target: null, ...overrides })
const envelope = (seq: number): DisplayEnvelope => ({
  v: 1, sessionId: 'till', seq, at: seq, locale: 'th', currency: 'THB', shopName: 'ร้าน', state: { kind: 'idle' },
})

describe('InMemoryDisplayHub: the screens', () => {
  test('finds a waiting screen by its code and by its token', async () => {
    const hub = new InMemoryDisplayHub()
    await hub.add(session('a', '111111'))

    expect((await hub.findWaitingByCode('111111', now))?.id).toBe('a')
    expect(await hub.findWaitingByCode('222222', now)).toBeNull()
    expect((await hub.findByToken('token-a'.padEnd(30, 'x')))?.id).toBe('a')
  })

  test('does not find a code that ran out, and prunes such screens', async () => {
    const hub = new InMemoryDisplayHub()
    await hub.add(session('a', '111111'))
    const late = after(PAIRING_CODE_VALID_MS)

    expect(await hub.findWaitingByCode('111111', late)).toBeNull()
    expect(await hub.countWaiting(late)).toBe(0)
    await hub.prune(late)
    expect(await hub.findByToken('token-a'.padEnd(30, 'x'))).toBeNull()
  })

  test('a paired screen is found by its target, not by the code any more', async () => {
    const hub = new InMemoryDisplayHub()
    const target = { branchId: 1, registerId: 4 }
    await hub.add(session('a', '111111'))
    await hub.save((await hub.findByToken('token-a'.padEnd(30, 'x')))!.pair(target, now))

    expect(await hub.findWaitingByCode('111111', now)).toBeNull()
    expect((await hub.findPairedTo(target)).map((s) => s.id)).toEqual(['a'])
    expect(await hub.findPairedTo({ branchId: 1, registerId: 5 })).toEqual([])
    expect(await hub.findPairedTo({ branchId: 1, registerId: null })).toEqual([])
  })

  test('keeps the last state of a target until it is cleared', async () => {
    const hub = new InMemoryDisplayHub()
    const target = { branchId: 1, registerId: null }
    await hub.setLatestState(target, envelope(3))
    expect((await hub.latestState(target))?.seq).toBe(3)
    expect(await hub.latestState({ branchId: 2, registerId: null })).toBeNull()
    await hub.clearLatestState(target)
    expect(await hub.latestState(target)).toBeNull()
  })
})

describe('InMemoryDisplayHub: the stream', () => {
  test('tells every listener of a session and only that session', () => {
    const hub = new InMemoryDisplayHub()
    const first: DisplayEvent[] = []
    const second: DisplayEvent[] = []
    const other: DisplayEvent[] = []
    hub.subscribe('a', (e) => first.push(e))
    hub.subscribe('a', (e) => second.push(e))
    hub.subscribe('b', (e) => other.push(e))

    hub.publish('a', { type: 'paired' })

    expect(first).toEqual([{ type: 'paired' }])
    expect(second).toEqual([{ type: 'paired' }])
    expect(other).toEqual([])
  })

  test('stops telling a listener that unsubscribed', () => {
    const hub = new InMemoryDisplayHub()
    const heard: DisplayEvent[] = []
    const stop = hub.subscribe('a', (e) => heard.push(e))
    stop()
    hub.publish('a', { type: 'ping' })
    expect(heard).toEqual([])
  })
})

describe('InMemoryPairingGuard', () => {
  test('locks a user after five wrong codes and lets them in again after fifteen minutes', () => {
    let clock = 1_000_000
    const guard = new InMemoryPairingGuard(() => clock)
    for (let i = 0; i < 4; i++) guard.recordFailure(7)
    expect(guard.check(7)).toBe('ok')
    guard.recordFailure(7)
    expect(guard.check(7)).toBe('locked')
    expect(guard.check(8)).toBe('ok')
    clock += 15 * 60_000
    expect(guard.check(7)).toBe('ok')
  })

  test('a right code clears the failures counted so far', () => {
    const guard = new InMemoryPairingGuard(() => 0)
    for (let i = 0; i < 4; i++) guard.recordFailure(7)
    guard.recordSuccess(7)
    guard.recordFailure(7)
    expect(guard.check(7)).toBe('ok')
  })
})

describe('CryptoDisplayIdentifiers', () => {
  test('codes are six digits, tokens are long and every id differs', () => {
    const ids = new CryptoDisplayIdentifiers()
    for (let i = 0; i < 50; i++) expect(ids.newCode()).toMatch(/^\d{6}$/)
    expect(ids.newToken().length).toBeGreaterThanOrEqual(40)
    expect(ids.newToken()).not.toBe(ids.newToken())
    expect(ids.newId()).not.toBe(ids.newId())
  })
})
