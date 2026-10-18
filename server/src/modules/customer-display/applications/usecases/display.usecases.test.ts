import 'reflect-metadata'
import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { MAX_WAITING_SESSIONS, PAIRING_CODE_VALID_MS } from '../../../../domains/display-session.domain'
import { mockClock } from '../../../../__tests__/mocks'
import { CryptoDisplayIdentifiers, InMemoryPairingGuard } from '../../adapters/in-memory-pairing-guard'
import { InMemoryDisplayHub } from '../../adapters/in-memory-display-hub'
import type { DisplayEvent } from '../ports/display-stream.port'
import type { IDisplayIdentifiers } from '../ports/pairing-guard.port'
import type { DisplayEnvelope } from '../schemas/display-schemas'
import { GetDisplayPairingUseCase } from './get-display-pairing.usecase'
import { OpenDisplayStreamUseCase } from './open-display-stream.usecase'
import { PairDisplayUseCase } from './pair-display.usecase'
import { PublishDisplayStateUseCase } from './publish-display-state.usecase'
import { StartDisplaySessionUseCase } from './start-display-session.usecase'
import { UnpairDisplayUseCase } from './unpair-display.usecase'

const codeOf = async (action: () => Promise<unknown>) => {
  try {
    await action()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

const now = new Date('2026-10-16T09:00:00Z')
const cashier = { userId: 7, branchId: 1 }
const envelope = (seq: number, total = 9500): DisplayEnvelope => ({
  v: 1, sessionId: 'till-1', seq, at: seq, locale: 'th', currency: 'THB', shopName: 'ร้านกาแฟ',
  state: {
    kind: 'selling',
    lines: [{ name: 'กาแฟเย็น', options: ['หวานน้อย'], quantity: 2, lineTotalSatang: total }],
    subtotalSatang: total, discountSatang: 0, vatSatang: 621, vatMode: 'inclusive', totalSatang: total,
  },
})

let hub: InMemoryDisplayHub
let guard: InMemoryPairingGuard
let clock: ReturnType<typeof mockClock>
let start: StartDisplaySessionUseCase
let pair: PairDisplayUseCase
let publish: PublishDisplayStateUseCase
let unpair: UnpairDisplayUseCase
let pairing: GetDisplayPairingUseCase
let open: OpenDisplayStreamUseCase

/** A source of codes that hands out the given ones in turn, then random ones. */
const codes = (...given: string[]): IDisplayIdentifiers => {
  const real = new CryptoDisplayIdentifiers()
  const queue = [...given]
  return { newId: () => real.newId(), newToken: () => real.newToken(), newCode: () => queue.shift() ?? real.newCode() }
}

function build(ids: IDisplayIdentifiers = new CryptoDisplayIdentifiers()) {
  hub = new InMemoryDisplayHub()
  guard = new InMemoryPairingGuard(() => now.getTime())
  clock = mockClock(now)
  start = new StartDisplaySessionUseCase(hub, ids, clock)
  pair = new PairDisplayUseCase(hub, hub, guard, clock)
  publish = new PublishDisplayStateUseCase(hub, hub)
  unpair = new UnpairDisplayUseCase(hub, hub)
  pairing = new GetDisplayPairingUseCase(hub)
  open = new OpenDisplayStreamUseCase(hub, hub, clock)
}

beforeEach(() => build())

/** Reads up to `count` events from a stream, then lets it go. */
async function take(token: string, count: number): Promise<DisplayEvent[]> {
  const controller = new AbortController()
  const events: DisplayEvent[] = []
  for await (const event of open.execute(token, controller.signal, 5)) {
    events.push(event)
    if (events.length >= count) controller.abort()
    if (event.type === 'unpaired' || event.type === 'expired') break
  }
  return events
}

describe('StartDisplaySessionUseCase', () => {
  test('gives a waiting screen a six digit code and a token of its own', async () => {
    const session = await start.execute()
    expect(session.status).toBe('waiting')
    expect(session.code).toMatch(/^\d{6}$/)
    expect(session.token.length).toBeGreaterThanOrEqual(40)
    expect((await hub.findByToken(session.token))?.id).toBe(session.id)
  })

  test('never gives one code to two waiting screens', async () => {
    build(codes('111111', '111111', '222222'))
    const first = await start.execute()
    const second = await start.execute()
    expect(first.code).toBe('111111')
    expect(second.code).toBe('222222')
  })

  test('refuses more waiting screens than the limit, and counts only those that have not run out', async () => {
    for (let i = 0; i < MAX_WAITING_SESSIONS; i++) await start.execute()
    expect(await codeOf(() => start.execute())).toBe('DISPLAY_SESSIONS_FULL')

    clock.now.mockReturnValue(new Date(now.getTime() + PAIRING_CODE_VALID_MS))
    expect((await start.execute()).status).toBe('waiting')
  })
})

describe('PairDisplayUseCase', () => {
  test('binds the screen with that code to the register of the till and tells the screen', async () => {
    const screen = await start.execute()
    const heard: DisplayEvent[] = []
    hub.subscribe(screen.id, (event) => heard.push(event))

    const result = await pair.execute({ code: screen.code, registerId: 4 }, cashier)

    expect(result).toEqual({ displays: 1 })
    expect((await hub.findByToken(screen.token))?.target).toEqual({ branchId: 1, registerId: 4 })
    expect(heard).toEqual([{ type: 'paired' }])
  })

  test('uses the branch when the till names no register', async () => {
    const screen = await start.execute()
    await pair.execute({ code: screen.code }, cashier)
    expect((await hub.findByToken(screen.token))?.target).toEqual({ branchId: 1, registerId: null })
  })

  test('gives a screen that joins late what the till last said', async () => {
    await publish.execute({ registerId: 4, envelope: envelope(3) }, cashier)
    const screen = await start.execute()
    const heard: DisplayEvent[] = []
    hub.subscribe(screen.id, (event) => heard.push(event))

    await pair.execute({ code: screen.code, registerId: 4 }, cashier)

    expect(heard.map((event) => event.type)).toEqual(['paired', 'state'])
  })

  test('an unknown or used-up code is not found, and a malformed one is refused', async () => {
    const screen = await start.execute()
    expect(await codeOf(() => pair.execute({ code: '000000', registerId: 4 }, cashier))).toBe('DISPLAY_CODE_NOT_FOUND')
    await pair.execute({ code: screen.code, registerId: 4 }, cashier)
    expect(await codeOf(() => pair.execute({ code: screen.code, registerId: 4 }, cashier))).toBe('DISPLAY_CODE_NOT_FOUND')
    await expect(pair.execute({ code: '12ab56' }, cashier)).rejects.toBeInstanceOf(ZodError)
  })

  test('a code that ran out is not found', async () => {
    const screen = await start.execute()
    clock.now.mockReturnValue(new Date(now.getTime() + PAIRING_CODE_VALID_MS))
    expect(await codeOf(() => pair.execute({ code: screen.code }, cashier))).toBe('DISPLAY_CODE_NOT_FOUND')
  })

  test('locks the person out after five wrong codes, even for the right one', async () => {
    const screen = await start.execute()
    for (let i = 0; i < 5; i++) await codeOf(() => pair.execute({ code: '000000' }, cashier))
    expect(await codeOf(() => pair.execute({ code: screen.code }, cashier))).toBe('DISPLAY_PAIRING_LOCKED')
    // Someone else at another till is not locked.
    expect(await pair.execute({ code: screen.code }, { userId: 8, branchId: 1 })).toEqual({ displays: 1 })
  })
})

describe('PublishDisplayStateUseCase', () => {
  test('tells every screen that follows the till, and no other screen', async () => {
    const [a, b, other] = [await start.execute(), await start.execute(), await start.execute()]
    await pair.execute({ code: a.code, registerId: 4 }, cashier)
    await pair.execute({ code: b.code, registerId: 4 }, cashier)
    await pair.execute({ code: other.code, registerId: 5 }, cashier)
    const heard: Record<string, DisplayEvent[]> = { a: [], b: [], other: [] }
    hub.subscribe(a.id, (event) => heard.a!.push(event))
    hub.subscribe(b.id, (event) => heard.b!.push(event))
    hub.subscribe(other.id, (event) => heard.other!.push(event))

    const result = await publish.execute({ registerId: 4, envelope: envelope(1) }, cashier)

    expect(result).toEqual({ displays: 2 })
    expect(heard.a).toHaveLength(1)
    expect(heard.b).toHaveLength(1)
    expect(heard.other).toHaveLength(0)
  })

  test('a till of another branch cannot reach a screen of this one', async () => {
    const screen = await start.execute()
    await pair.execute({ code: screen.code, registerId: 4 }, cashier)
    const heard: DisplayEvent[] = []
    hub.subscribe(screen.id, (event) => heard.push(event))

    await publish.execute({ registerId: 4, envelope: envelope(1) }, { userId: 9, branchId: 2 })

    expect(heard).toEqual([])
  })

  test('refuses an envelope with an amount that is not a whole number of satang', async () => {
    const bad = envelope(1)
    ;(bad.state as { totalSatang: number }).totalSatang = 95.5
    await expect(publish.execute({ envelope: bad }, cashier)).rejects.toBeInstanceOf(ZodError)
  })

  test('refuses a QR image that is not plain base64', async () => {
    const bad = { ...envelope(1), state: { kind: 'paying', lines: [], totalSatang: 100, qr: { image: 'javascript:alert(1)', expiresAt: now.toISOString() } } }
    await expect(publish.execute({ envelope: bad }, cashier)).rejects.toBeInstanceOf(ZodError)
  })

  describe('a static PromptPay QR sent as its payload', () => {
    const payload = '00020101021229370016A000000677010111011300668123456785802TH530376454041.006304ABCD'
    const paying = (qr: unknown) => ({ ...envelope(1), state: { kind: 'paying', lines: [], totalSatang: 100, qr } })

    test('reaches the screens as it was sent', async () => {
      const screen = await start.execute()
      await pair.execute({ code: screen.code, registerId: 4 }, cashier)
      const heard: DisplayEvent[] = []
      hub.subscribe(screen.id, (event) => heard.push(event))

      await publish.execute({ registerId: 4, envelope: paying({ payload }) }, cashier)

      expect(heard).toHaveLength(1)
      expect(heard[0]).toMatchObject({ type: 'state', envelope: { state: { kind: 'paying', qr: { payload } } } })
    })

    test('refuses a payload that is empty, not printable ASCII, or too long', async () => {
      for (const bad of ['', 'ไม่ใช่ QR', `${payload}\n`, 'A'.repeat(513)])
        await expect(publish.execute({ envelope: paying({ payload: bad }) }, cashier)).rejects.toBeInstanceOf(ZodError)
    })

    test('refuses a QR that is both a picture and a payload', async () => {
      const both = paying({ payload, image: 'iVBORw0KGgo=', expiresAt: now.toISOString() })
      await expect(publish.execute({ envelope: both }, cashier)).rejects.toBeInstanceOf(ZodError)
    })
  })
})

describe('UnpairDisplayUseCase', () => {
  test('tells the screens, forgets them and the last state', async () => {
    const screen = await start.execute()
    await pair.execute({ code: screen.code, registerId: 4 }, cashier)
    await publish.execute({ registerId: 4, envelope: envelope(1) }, cashier)
    const heard: DisplayEvent[] = []
    hub.subscribe(screen.id, (event) => heard.push(event))

    expect(await unpair.execute({ registerId: 4 }, cashier)).toEqual({ displays: 1 })

    expect(heard).toEqual([{ type: 'unpaired' }])
    expect(await hub.findByToken(screen.token)).toBeNull()
    expect(await hub.latestState({ branchId: 1, registerId: 4 })).toBeNull()
    expect(await pairing.execute({ registerId: 4 }, cashier)).toEqual({ displays: 0 })
  })
})

describe('GetDisplayPairingUseCase', () => {
  test('counts the screens that follow this till', async () => {
    expect(await pairing.execute({ registerId: 4 }, cashier)).toEqual({ displays: 0 })
    const screen = await start.execute()
    await pair.execute({ code: screen.code, registerId: 4 }, cashier)
    expect(await pairing.execute({ registerId: 4 }, cashier)).toEqual({ displays: 1 })
    expect(await pairing.execute({ registerId: 5 }, cashier)).toEqual({ displays: 0 })
  })
})

describe('OpenDisplayStreamUseCase', () => {
  test('a waiting screen is told its code and when it runs out', async () => {
    const screen = await start.execute()
    const [first] = await take(screen.token, 1)
    expect(first).toEqual({ type: 'waiting', code: screen.code, expiresAt: screen.expiresAt.toISOString() })
  })

  test('is told it is paired, then the sale, when the till pairs and speaks', async () => {
    const screen = await start.execute()
    const reading = take(screen.token, 3)
    await Bun.sleep(5)
    await pair.execute({ code: screen.code, registerId: 4 }, cashier)
    await publish.execute({ registerId: 4, envelope: envelope(1) }, cashier)

    const events = await reading
    expect(events.map((event) => event.type)).toEqual(['waiting', 'paired', 'state'])
  })

  test('a paired screen that connects again is given the last state at once', async () => {
    const screen = await start.execute()
    await pair.execute({ code: screen.code, registerId: 4 }, cashier)
    await publish.execute({ registerId: 4, envelope: envelope(7) }, cashier)

    const events = await take(screen.token, 2)

    expect(events[0]).toEqual({ type: 'paired' })
    expect(events[1]).toMatchObject({ type: 'state', envelope: { seq: 7 } })
  })

  test('says it is still there while nothing happens', async () => {
    const screen = await start.execute()
    const events = await take(screen.token, 2)
    expect(events.map((event) => event.type)).toEqual(['waiting', 'ping'])
  })

  test('ends with expired when the code ran out before it was paired', async () => {
    const screen = await start.execute()
    clock.now.mockReturnValue(new Date(now.getTime() + PAIRING_CODE_VALID_MS))
    expect(await take(screen.token, 5)).toEqual([{ type: 'expired' }])
  })

  test('ends when the till lets the screen go', async () => {
    const screen = await start.execute()
    await pair.execute({ code: screen.code, registerId: 4 }, cashier)
    const reading = take(screen.token, 5)
    await Bun.sleep(5)
    await unpair.execute({ registerId: 4 }, cashier)
    expect((await reading).at(-1)).toEqual({ type: 'unpaired' })
  })

  test('an unknown token has no stream', async () => {
    await expect(take('x'.repeat(40), 1)).rejects.toMatchObject({ code: 'DISPLAY_SESSION_NOT_FOUND' })
  })
})
