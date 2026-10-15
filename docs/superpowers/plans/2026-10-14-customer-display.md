# Customer display implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only second-screen page at `/customer` that shows the cashier's sale (items, total, bank QR, paid) on the same computer, fed by the till through a `BroadcastChannel`.

**Architecture:** A new web feature `customer-display` holds the message format, a framework-free publisher and receiver (tested with an in-memory channel), the page, and two thin React hooks. The till (`pos`) maps its priced cart to a display state with a pure function and publishes it; `/customer` is rendered before the sign-in gate and calls no API.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (`tw-animate-css`), react-i18next, `BroadcastChannel`, `bun test`, Playwright (existing e2e harness).

**Spec:** `docs/superpowers/specs/2026-10-14-customer-display-design.md`

## Global Constraints

- Work on branch `ohmattpon/customer-display` (from `main`). **Never push or merge.** Commit only with `gitcz` (`gitcz --non-interactive --type=<type> --scope=web --subject="..." --body="..."`), never `git commit`. `--type` is one of `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `perf`, `ci`, `chore` (not `build`). End each commit body with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Stage only the files of the task (`git add <files>`), never `git add -A`.
- Money is an integer in the minor unit (satang). Never write `฿`, `/ 100` or `Intl` in a component: use `createMoney(currency, locale)` and `createDateFormat(locale)` from `@/lib/money`.
- Every string a person reads comes from `t()`. A feature owns its namespace in `locales.ts` as `{ th, en }`; Thai is the source of the key types and `en` uses `satisfies typeof th`.
- Feature rules: other features are used through `@/features/<name>` (`index.ts`) only; a feature never imports from `app/`; no cycles. `pos` may use `customer-display`; `customer-display` must not import `pos`.
- Colours only through the theme tokens (`bg-canvas`, `bg-card`, `text-foreground`, `text-success`...), never raw hex. No `dark:` classes.
- No change to `apps/api`, the database, the OpenAPI baselines or `calculateTotals`.
- Comments are English and explain *why*, in the style of the surrounding code.
- The `/customer` page makes **zero** API requests and needs no sign-in.
- A message carries only what is printed on a receipt: no cost, profit, stock, cashier or ids.
- Before saying the work is done: `bun run typecheck`, `bun run lint`, and the web tests (`cd apps/web && bun test`) pass. The full `bun run test` and `bun run e2e` need the local database in Docker: ask the owner before starting Docker.

## Review Focus

Failure modes the spec implies that are most likely to bite, most likely first. Each has a test in the task that owns the code.

1. A message from a hostile or buggy sender is oversized or malformed (300+ lines, a QR image with quotes or a `<script>` in it): it must be dropped, never rendered. → Task 1.
2. The till window reloads mid-sale: the new session replaces the old one, and a late message from the old session must not bring the old basket back. → Task 1 (`pickNewer`), Task 2 (receiver).
3. The cashier adds an item while "paid" is still on the screen: the new sale wins over "paid". → Task 4 (`toDisplayState`).
4. A free sale (total 0, or a discount equal to the subtotal): the screen shows a zero total and no QR, and nothing divides or crashes. → Task 4.
5. The till goes quiet (tab frozen, crash): the display must go idle and never keep a stranger's basket. → Task 1 (`isStale`), Task 2 (receiver).
6. Extra fields on a message (a future `costSatang`): they must be stripped on receipt, not passed to the page. → Task 1.

---

## File structure

Create:

| File | Responsibility |
|---|---|
| `apps/web/src/features/customer-display/lib/display-state.ts` | Types, constants, the hand-written message validator, `isStale`, `pickNewer` (pure) |
| `apps/web/src/features/customer-display/lib/channel.ts` | `DisplayChannel` interface, the `BroadcastChannel` wrapper, an in-memory bus for tests |
| `apps/web/src/features/customer-display/lib/publisher.ts` | `DisplayPublisher`: the till side (framework-free) |
| `apps/web/src/features/customer-display/lib/receiver.ts` | `DisplayReceiver`: the display side (framework-free) |
| `apps/web/src/features/customer-display/lib/open-display.ts` | `openCustomerDisplay()` |
| `apps/web/src/features/customer-display/hooks/use-customer-display-publisher.ts` | React glue for the till |
| `apps/web/src/features/customer-display/hooks/use-display-receiver.ts` | React glue for the display |
| `apps/web/src/features/customer-display/hooks/use-screen-chrome.ts` | Idle cursor and fullscreen for the display |
| `apps/web/src/features/customer-display/components/CustomerDisplayPage.tsx` | The four screens |
| `apps/web/src/features/customer-display/locales.ts` | Thai and English text |
| `apps/web/src/features/customer-display/index.ts` | Public surface of the feature |
| `apps/web/src/features/pos/lib/customer-display.ts` | `toDisplayState`: priced cart → display state (pure) |

Tests (beside the files): `lib/display-state.test.ts`, `lib/publisher.test.ts`, `lib/receiver.test.ts`, `pos/lib/customer-display.test.ts`.

Modify: `apps/web/src/app/App.tsx`, `apps/web/src/app/i18n.ts`, `apps/web/src/features/pos/components/PosPage.tsx`, `apps/web/src/features/pos/components/PaymentDialog.tsx`, `apps/web/src/features/pos/locales.ts`, `apps/web/e2e/run.ts`, `apps/web/e2e/shots.ts`, `DESIGN.md`, `docs/summary.md`, and the spec.

---

### Task 1: Message format, validation and ordering rules

**Files:**
- Modify: `docs/superpowers/specs/2026-10-14-customer-display-design.md`
- Create: `apps/web/src/features/customer-display/lib/display-state.ts`
- Test: `apps/web/src/features/customer-display/lib/display-state.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - constants `CHANNEL_NAME`, `ENVELOPE_VERSION`, `HEARTBEAT_MS` (10 000), `STALE_AFTER_MS` (30 000), `PAID_SHOWN_MS` (5 000)
  - types `DisplayLine`, `DisplayQr`, `DisplayState`, `DisplayView`, `DisplayEnvelope`, `DisplayMessage`, `ParsedMessage`
  - `parseEnvelope(raw: unknown): DisplayEnvelope | null`
  - `parseMessage(raw: unknown): ParsedMessage | null`
  - `isStale(now: number, heardAt: number): boolean`
  - `pickNewer(current: DisplayEnvelope | null, incoming: DisplayEnvelope): DisplayEnvelope`

- [ ] **Step 1: Align the spec with two findings**

Two statements in the spec do not survive contact with the code: `apps/web` has no `zod` dependency (and one more dependency is not worth a 60-line validator), and a customer-side 5-second timer for "paid" would restart on every heartbeat. Edit the spec:

In `docs/superpowers/specs/2026-10-14-customer-display-design.md`:

1. Replace `- จอลูกค้าตรวจทุกข้อความด้วย zod schema ข้อความผิดรูปถูกทิ้งเงียบ ๆ` with
   `- จอลูกค้าตรวจทุกข้อความด้วยตัวตรวจที่เขียนเองใน \`display-state.ts\` (เว็บไม่มี \`zod\` เป็น dependency และไม่คุ้มที่จะเพิ่ม) ข้อความผิดรูปหรือเกินขนาดถูกทิ้งเงียบ ๆ และฟิลด์ที่ไม่รู้จักถูกตัดทิ้ง`
2. Replace `5. สถานะ \`paid\` จอลูกค้ากลับเป็นว่างเองหลัง 5 วินาที` with
   `5. สถานะ \`paid\` หน้าขายเป็นผู้นับ 5 วินาทีแล้วส่ง \`idle\` เอง (ไม่ให้จอลูกค้านับ เพราะการส่งซ้ำทุก 10 วินาทีจะทำให้ "ชำระแล้ว" โผล่ซ้ำ)`
3. In section 6, replace `schema: ปฏิเสธข้อความผิดรูป ชนิดไม่รู้จัก และรุ่น \`v\` ที่ไม่ตรง` with
   `ตัวตรวจข้อความ: ปฏิเสธข้อความผิดรูป เกินขนาด ชนิดไม่รู้จัก และรุ่น \`v\` ที่ไม่ตรง และตัดฟิลด์ที่ไม่รู้จัก`

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/features/customer-display/lib/display-state.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { isStale, parseEnvelope, parseMessage, pickNewer, STALE_AFTER_MS, type DisplayEnvelope } from './display-state'

const line = { name: 'กาแฟเย็น', options: ['หวานน้อย'], quantity: 2, lineTotalSatang: 7000 }
const selling = {
  kind: 'selling',
  lines: [line],
  subtotalSatang: 7000,
  discountSatang: 0,
  vatSatang: 458,
  vatMode: 'inclusive',
  totalSatang: 7000,
}
const envelope = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  sessionId: 'till-1',
  seq: 1,
  at: 1_000,
  locale: 'th',
  currency: 'THB',
  shopName: 'ร้านตัวอย่าง',
  state: selling,
  ...overrides,
})
const valid = (overrides: Record<string, unknown> = {}) => parseEnvelope(envelope(overrides)) as DisplayEnvelope

describe('parseEnvelope', () => {
  test('accepts a selling state exactly as sent', () => {
    expect(parseEnvelope(envelope())).toEqual(envelope() as unknown as DisplayEnvelope)
  })

  test('accepts idle, paying (with and without a QR) and paid', () => {
    expect(parseEnvelope(envelope({ state: { kind: 'idle' } }))?.state).toEqual({ kind: 'idle' })
    const qr = { image: 'iVBORw0KGgo=', expiresAt: '2026-10-14T10:35:00.000Z' }
    expect(parseEnvelope(envelope({ state: { kind: 'paying', lines: [line], totalSatang: 7000, qr } }))?.state)
      .toEqual({ kind: 'paying', lines: [line], totalSatang: 7000, qr })
    expect(parseEnvelope(envelope({ state: { kind: 'paying', lines: [line], totalSatang: 7000, qr: null } }))?.state)
      .toEqual({ kind: 'paying', lines: [line], totalSatang: 7000, qr: null })
    expect(parseEnvelope(envelope({ state: { kind: 'paid', totalSatang: 7000, changeSatang: 300 } }))?.state)
      .toEqual({ kind: 'paid', totalSatang: 7000, changeSatang: 300 })
  })

  test('drops fields it does not know, so internal data a sender adds never reaches the page', () => {
    const parsed = parseEnvelope(envelope({
      cashierName: 'สมชาย',
      state: { ...selling, costSatang: 3000, lines: [{ ...line, stockQty: 4, productId: 9 }] },
    }))!
    expect('cashierName' in parsed).toBe(false)
    expect('costSatang' in parsed.state).toBe(false)
    const shown = parsed.state as Extract<DisplayEnvelope['state'], { kind: 'selling' }>
    expect(Object.keys(shown.lines[0]!).sort()).toEqual(['lineTotalSatang', 'name', 'options', 'quantity'])
  })

  test.each([
    ['another version', { v: 2 }],
    ['no session', { sessionId: '' }],
    ['an over-long session', { sessionId: 'x'.repeat(65) }],
    ['a negative sequence', { seq: -1 }],
    ['an unknown locale', { locale: 'fr' }],
    ['a lower-case currency', { currency: 'thb' }],
    ['an over-long shop name', { shopName: 'x'.repeat(201) }],
    ['an unknown state', { state: { kind: 'refund' } }],
    ['a negative amount', { state: { ...selling, totalSatang: -1 } }],
    ['a fractional amount', { state: { ...selling, totalSatang: 10.5 } }],
    ['an unknown VAT mode', { state: { ...selling, vatMode: 'maybe' } }],
    ['lines that are not a list', { state: { ...selling, lines: 'กาแฟ' } }],
    ['a line with no quantity', { state: { ...selling, lines: [{ ...line, quantity: 0 }] } }],
  ])('rejects %s', (_name, overrides) => {
    expect(parseEnvelope(envelope(overrides))).toBeNull()
  })

  test('rejects a message that would take the screen down: too many lines, too many options', () => {
    expect(parseEnvelope(envelope({ state: { ...selling, lines: Array.from({ length: 301 }, () => line) } }))).toBeNull()
    expect(parseEnvelope(envelope({ state: { ...selling, lines: [{ ...line, options: Array.from({ length: 21 }, () => 'x') }] } }))).toBeNull()
  })

  test('rejects a QR image that is not plain base64, so it cannot break out of the image source', () => {
    const paying = (image: unknown, expiresAt: unknown = '2026-10-14T10:35:00.000Z') =>
      envelope({ state: { kind: 'paying', lines: [line], totalSatang: 7000, qr: { image, expiresAt } } })
    expect(parseEnvelope(paying('abc"><script>alert(1)</script>'))).toBeNull()
    expect(parseEnvelope(paying('javascript:alert(1)'))).toBeNull()
    expect(parseEnvelope(paying(''))).toBeNull()
    expect(parseEnvelope(paying(42))).toBeNull()
    expect(parseEnvelope(paying('A'.repeat(200_001)))).toBeNull()
    expect(parseEnvelope(paying('iVBORw0KGgo=', 'not a date'))).toBeNull()
  })

  test.each([null, undefined, 'hello', 7, [], {}])('rejects %p', (raw) => {
    expect(parseEnvelope(raw)).toBeNull()
  })
})

describe('parseMessage', () => {
  test('reads hello and state messages', () => {
    expect(parseMessage({ type: 'hello' })).toEqual({ type: 'hello' })
    expect(parseMessage({ type: 'state', envelope: envelope() })).toEqual({ type: 'state', envelope: valid() })
  })

  test('ignores anything else, including a state message with a bad envelope', () => {
    expect(parseMessage({ type: 'state', envelope: { v: 9 } })).toBeNull()
    expect(parseMessage({ type: 'launch' })).toBeNull()
    expect(parseMessage(null)).toBeNull()
    expect(parseMessage('state')).toBeNull()
  })
})

describe('isStale', () => {
  test('is quiet for exactly the allowed time, and stale after it', () => {
    expect(isStale(STALE_AFTER_MS, 0)).toBe(false)
    expect(isStale(STALE_AFTER_MS + 1, 0)).toBe(true)
  })
})

describe('pickNewer', () => {
  test('takes the first message', () => {
    expect(pickNewer(null, valid())).toEqual(valid())
  })

  test('within one session only a higher sequence wins', () => {
    const current = valid({ seq: 5 })
    expect(pickNewer(current, valid({ seq: 5 }))).toBe(current)
    expect(pickNewer(current, valid({ seq: 4 }))).toBe(current)
    const next = valid({ seq: 6 })
    expect(pickNewer(current, next)).toBe(next)
  })

  test('a till that reloaded (new session) replaces the old one when it spoke later', () => {
    const current = valid({ sessionId: 'old', seq: 99, at: 1_000 })
    const reloaded = valid({ sessionId: 'new', seq: 1, at: 2_000 })
    expect(pickNewer(current, reloaded)).toBe(reloaded)
  })

  test('a late message from the old session does not bring the old basket back', () => {
    const current = valid({ sessionId: 'new', seq: 3, at: 5_000 })
    const late = valid({ sessionId: 'old', seq: 100, at: 4_000 })
    expect(pickNewer(current, late)).toBe(current)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && bun test src/features/customer-display/lib/display-state.test.ts`
Expected: FAIL (cannot find module `./display-state`).

- [ ] **Step 4: Write the implementation**

Create `apps/web/src/features/customer-display/lib/display-state.ts`:

```ts
import { VAT_MODES, type VatMode } from '@pos/api/pricing'
import type { Locale } from '@/lib/money'

/** One channel name for the whole origin: every till window and every customer window share it. */
export const CHANNEL_NAME = 'easypos-customer-display'
export const ENVELOPE_VERSION = 1 as const
/** The till repeats its state this often, so a display that opened late or missed a message catches up. */
export const HEARTBEAT_MS = 10_000
/** A display that has heard nothing for this long stops showing what it last saw. */
export const STALE_AFTER_MS = 30_000
/** How long "paid" stays on the screen before the idle screen returns. */
export const PAID_SHOWN_MS = 5_000

// Limits that keep a buggy or hostile message from taking the screen down.
const MAX_LINES = 300
const MAX_OPTIONS = 20
const MAX_TEXT = 200
const MAX_SESSION = 64
const MAX_QR_IMAGE = 200_000

/** What the customer may see of one line: what is printed on the receipt, nothing else. */
export interface DisplayLine {
  name: string
  options: string[]
  quantity: number
  lineTotalSatang: number
}

export interface DisplayQr {
  /** Base64 PNG, as the bank returned it. */
  image: string
  /** ISO time the QR stops being payable. */
  expiresAt: string
}

export type DisplayState =
  | { kind: 'idle' }
  | {
      kind: 'selling'
      lines: DisplayLine[]
      subtotalSatang: number
      discountSatang: number
      vatSatang: number
      vatMode: VatMode
      totalSatang: number
    }
  | { kind: 'paying'; lines: DisplayLine[]; totalSatang: number; qr: DisplayQr | null }
  | { kind: 'paid'; totalSatang: number; changeSatang: number }

/** What the till decides: the shop's language and currency, its name, and what is on the counter now. */
export interface DisplayView {
  locale: Locale
  currency: string
  shopName: string
  state: DisplayState
}

export interface DisplayEnvelope extends DisplayView {
  v: typeof ENVELOPE_VERSION
  /** Names one till window; a reload makes a new one. */
  sessionId: string
  /** Rises by one with every message of a session. */
  seq: number
  /** When it was sent, in ms. */
  at: number
}

/** `envelope` is `unknown` on the wire: whoever receives it must parse it. */
export type DisplayMessage = { type: 'hello' } | { type: 'state'; envelope: unknown }
export type ParsedMessage = { type: 'hello' } | { type: 'state'; envelope: DisplayEnvelope }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown, max = MAX_TEXT): value is string => typeof value === 'string' && value.length <= max
/** A non-negative integer: an amount in satang, a count, a sequence number or a time. */
const isWhole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

function parseLine(raw: unknown): DisplayLine | null {
  if (!isRecord(raw)) return null
  const { name, options, quantity, lineTotalSatang } = raw
  if (!isText(name) || !Array.isArray(options) || options.length > MAX_OPTIONS) return null
  if (!options.every((option) => isText(option))) return null
  if (!isWhole(quantity) || quantity < 1 || !isWhole(lineTotalSatang)) return null
  return { name, options: options as string[], quantity, lineTotalSatang }
}

function parseLines(raw: unknown): DisplayLine[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_LINES) return null
  const lines: DisplayLine[] = []
  for (const item of raw) {
    const line = parseLine(item)
    if (line === null) return null
    lines.push(line)
  }
  return lines
}

/** `null` is a valid answer (no QR); `undefined` means the QR was malformed. */
function parseQr(raw: unknown): DisplayQr | null | undefined {
  if (raw === null) return null
  if (!isRecord(raw)) return undefined
  const { image, expiresAt } = raw
  // The image goes into a data: URL, so only plain base64 may pass.
  if (typeof image !== 'string' || image.length > MAX_QR_IMAGE || !BASE64.test(image)) return undefined
  if (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))) return undefined
  return { image, expiresAt }
}

function parseState(raw: unknown): DisplayState | null {
  if (!isRecord(raw)) return null
  switch (raw.kind) {
    case 'idle':
      return { kind: 'idle' }
    case 'selling': {
      const lines = parseLines(raw.lines)
      const { subtotalSatang, discountSatang, vatSatang, vatMode, totalSatang } = raw
      if (lines === null) return null
      if (!isWhole(subtotalSatang) || !isWhole(discountSatang) || !isWhole(vatSatang) || !isWhole(totalSatang)) return null
      if (!VAT_MODES.includes(vatMode as VatMode)) return null
      return { kind: 'selling', lines, subtotalSatang, discountSatang, vatSatang, vatMode: vatMode as VatMode, totalSatang }
    }
    case 'paying': {
      const lines = parseLines(raw.lines)
      const qr = parseQr(raw.qr)
      const { totalSatang } = raw
      if (lines === null || qr === undefined || !isWhole(totalSatang)) return null
      return { kind: 'paying', lines, totalSatang, qr }
    }
    case 'paid': {
      const { totalSatang, changeSatang } = raw
      if (!isWhole(totalSatang) || !isWhole(changeSatang)) return null
      return { kind: 'paid', totalSatang, changeSatang }
    }
    default:
      return null
  }
}

/** Builds a clean envelope from untrusted data, or null. Anything it does not know is left behind. */
export function parseEnvelope(raw: unknown): DisplayEnvelope | null {
  if (!isRecord(raw) || raw.v !== ENVELOPE_VERSION) return null
  const { sessionId, seq, at, locale, currency, shopName } = raw
  if (!isText(sessionId, MAX_SESSION) || sessionId === '') return null
  if (!isWhole(seq) || !isWhole(at)) return null
  if (locale !== 'th' && locale !== 'en') return null
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return null
  if (!isText(shopName)) return null
  const state = parseState(raw.state)
  if (state === null) return null
  return { v: ENVELOPE_VERSION, sessionId, seq, at, locale, currency, shopName, state }
}

export function parseMessage(raw: unknown): ParsedMessage | null {
  if (!isRecord(raw)) return null
  if (raw.type === 'hello') return { type: 'hello' }
  if (raw.type === 'state') {
    const envelope = parseEnvelope(raw.envelope)
    return envelope === null ? null : { type: 'state', envelope }
  }
  return null
}

/** The till has not been heard from for too long to trust what it last showed. */
export function isStale(now: number, heardAt: number): boolean {
  return now - heardAt > STALE_AFTER_MS
}

/**
 * Which of two messages the display should believe. Inside one till window, only a later message counts.
 * Between windows (a reload makes a new session) the one that spoke last is the one at the counter, which
 * also keeps a late message from an old window from bringing its basket back.
 */
export function pickNewer(current: DisplayEnvelope | null, incoming: DisplayEnvelope): DisplayEnvelope {
  if (current === null) return incoming
  if (incoming.sessionId === current.sessionId) return incoming.seq > current.seq ? incoming : current
  return incoming.at >= current.at ? incoming : current
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && bun test src/features/customer-display/lib/display-state.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Typecheck and commit**

Run: `bun run typecheck` — Expected: all packages exit 0.

```bash
git add docs/superpowers/specs/2026-10-14-customer-display-design.md apps/web/src/features/customer-display/lib/display-state.ts apps/web/src/features/customer-display/lib/display-state.test.ts
gitcz --non-interactive --type=feat --scope=web --subject="validate and order customer display messages" --body="A hand-written validator (the web app has no zod) drops oversized, malformed and unknown-field messages; pickNewer and isStale decide which message the display believes. The spec now says the till times the paid screen.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Channel, publisher and receiver

**Files:**
- Create: `apps/web/src/features/customer-display/lib/channel.ts`
- Create: `apps/web/src/features/customer-display/lib/publisher.ts`
- Create: `apps/web/src/features/customer-display/lib/receiver.ts`
- Test: `apps/web/src/features/customer-display/lib/publisher.test.ts`
- Test: `apps/web/src/features/customer-display/lib/receiver.test.ts`

**Interfaces:**
- Consumes (Task 1): `DisplayMessage`, `DisplayView`, `DisplayEnvelope`, `CHANNEL_NAME`, `ENVELOPE_VERSION`, `HEARTBEAT_MS`, `parseMessage`, `pickNewer`, `isStale`.
- Produces:
  - `interface DisplayChannel { post(message: DisplayMessage): void; subscribe(listener: (message: unknown) => void): () => void; close(): void }`
  - `isChannelSupported(): boolean`, `openBroadcastChannel(): DisplayChannel`, `createMemoryBus(): { open(): DisplayChannel }`
  - `type Scheduler = (run: () => void, everyMs: number) => () => void`
  - `class DisplayPublisher { constructor(options: { channel: DisplayChannel; sessionId: string; now?: () => number; schedule?: Scheduler }); start(): void; update(view: DisplayView): void; leave(): void; stop(): void }`
  - `class DisplayReceiver { constructor(now?: () => number); receive(raw: unknown): boolean; view(): DisplayEnvelope | null }`

- [ ] **Step 1: Write the failing publisher tests**

Create `apps/web/src/features/customer-display/lib/publisher.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { createMemoryBus } from './channel'
import { parseMessage, type DisplayEnvelope, type DisplayView } from './display-state'
import { DisplayPublisher, type Scheduler } from './publisher'

/** A heartbeat the test fires by hand. */
function manualScheduler() {
  const tasks = new Set<() => void>()
  const schedule: Scheduler = (run) => {
    tasks.add(run)
    return () => void tasks.delete(run)
  }
  return { schedule, tick: () => [...tasks].forEach((run) => run()), count: () => tasks.size }
}

const selling: DisplayView['state'] = {
  kind: 'selling',
  lines: [{ name: 'กาแฟ', options: [], quantity: 1, lineTotalSatang: 3500 }],
  subtotalSatang: 3500,
  discountSatang: 0,
  vatSatang: 229,
  vatMode: 'inclusive',
  totalSatang: 3500,
}
const view = (state: DisplayView['state'] = selling): DisplayView => ({
  locale: 'th',
  currency: 'THB',
  shopName: 'ร้านตัวอย่าง',
  state,
})

function setup() {
  const bus = createMemoryBus()
  const scheduler = manualScheduler()
  const display = bus.open()
  const heard: unknown[] = []
  display.subscribe((raw) => heard.push(raw))
  const publisher = new DisplayPublisher({
    channel: bus.open(),
    sessionId: 'till-1',
    now: () => 5_000,
    schedule: scheduler.schedule,
  })
  publisher.start()
  const envelopes = (): DisplayEnvelope[] =>
    heard.flatMap((raw) => {
      const message = parseMessage(raw)
      return message?.type === 'state' ? [message.envelope] : []
    })
  return { bus, display, publisher, scheduler, heard, envelopes }
}

describe('DisplayPublisher', () => {
  test('sends the view with its session, a rising sequence and the time', () => {
    const { publisher, envelopes } = setup()
    publisher.update(view())
    publisher.update(view({ kind: 'idle' }))

    const [first, second] = envelopes()
    expect(first).toMatchObject({ v: 1, sessionId: 'till-1', seq: 1, at: 5_000, locale: 'th', currency: 'THB', shopName: 'ร้านตัวอย่าง' })
    expect(first!.state).toEqual(selling)
    expect(second).toMatchObject({ seq: 2, state: { kind: 'idle' } })
  })

  test('answers a display that says hello with the latest state', () => {
    const { publisher, display, envelopes } = setup()
    publisher.update(view())
    display.post({ type: 'hello' })

    const sent = envelopes()
    expect(sent).toHaveLength(2)
    expect(sent[1]!.state).toEqual(selling)
    expect(sent[1]!.seq).toBe(2)
  })

  test('repeats the latest state on every heartbeat', () => {
    const { publisher, scheduler, envelopes } = setup()
    publisher.update(view())
    scheduler.tick()
    scheduler.tick()

    expect(envelopes().map((envelope) => envelope.seq)).toEqual([1, 2, 3])
  })

  test('says nothing before it has anything to say', () => {
    const { display, scheduler, heard } = setup()
    display.post({ type: 'hello' })
    scheduler.tick()

    expect(heard).toHaveLength(0)
  })

  test('leave tells the displays to go idle but keeps the shop details', () => {
    const { publisher, envelopes } = setup()
    publisher.update(view())
    publisher.leave()

    const last = envelopes().at(-1)!
    expect(last.state).toEqual({ kind: 'idle' })
    expect(last).toMatchObject({ shopName: 'ร้านตัวอย่าง', locale: 'th', currency: 'THB' })
  })

  test('stop ends the heartbeat and stops answering hello', () => {
    const { publisher, display, scheduler, envelopes } = setup()
    publisher.update(view())
    publisher.stop()
    display.post({ type: 'hello' })
    scheduler.tick()

    expect(scheduler.count()).toBe(0)
    expect(envelopes()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Write the failing receiver tests**

Create `apps/web/src/features/customer-display/lib/receiver.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { STALE_AFTER_MS } from './display-state'
import { DisplayReceiver } from './receiver'

const selling = {
  kind: 'selling',
  lines: [{ name: 'กาแฟ', options: [], quantity: 1, lineTotalSatang: 3500 }],
  subtotalSatang: 3500,
  discountSatang: 0,
  vatSatang: 229,
  vatMode: 'inclusive',
  totalSatang: 3500,
}
const state = (overrides: Record<string, unknown> = {}) => ({
  type: 'state',
  envelope: { v: 1, sessionId: 'till-1', seq: 1, at: 1_000, locale: 'th', currency: 'THB', shopName: 'ร้านตัวอย่าง', state: selling, ...overrides },
})

function setup() {
  const clock = { now: 10_000 }
  const receiver = new DisplayReceiver(() => clock.now)
  return { clock, receiver }
}

describe('DisplayReceiver', () => {
  test('has nothing to show until the till speaks', () => {
    expect(setup().receiver.view()).toBeNull()
  })

  test('shows what the till sent, and says the view changed', () => {
    const { receiver } = setup()
    expect(receiver.receive(state())).toBe(true)
    expect(receiver.view()?.state).toEqual(selling as never)
    expect(receiver.view()?.shopName).toBe('ร้านตัวอย่าง')
  })

  test('ignores an older or repeated message of the same session', () => {
    const { receiver } = setup()
    receiver.receive(state({ seq: 5 }))
    expect(receiver.receive(state({ seq: 5 }))).toBe(false)
    expect(receiver.receive(state({ seq: 4, state: { kind: 'idle' } }))).toBe(false)
    expect(receiver.view()?.state.kind).toBe('selling')
  })

  test('ignores hello and anything it cannot read', () => {
    const { receiver } = setup()
    expect(receiver.receive({ type: 'hello' })).toBe(false)
    expect(receiver.receive(null)).toBe(false)
    expect(receiver.receive({ type: 'state', envelope: { v: 3 } })).toBe(false)
    expect(receiver.view()).toBeNull()
  })

  test('goes idle when the till has been quiet too long, keeping the shop name', () => {
    const { receiver, clock } = setup()
    receiver.receive(state())
    clock.now += STALE_AFTER_MS
    expect(receiver.view()?.state.kind).toBe('selling')

    clock.now += 1
    const idle = receiver.view()!
    expect(idle.state).toEqual({ kind: 'idle' })
    expect(idle.shopName).toBe('ร้านตัวอย่าง')
    // The same object each time, so a once-a-second refresh does not re-render the page.
    expect(receiver.view()).toBe(idle)
  })

  test('a new message after the silence brings the screen back', () => {
    const { receiver, clock } = setup()
    receiver.receive(state())
    clock.now += STALE_AFTER_MS + 1_000
    expect(receiver.view()?.state.kind).toBe('idle')

    receiver.receive(state({ seq: 2 }))
    expect(receiver.view()?.state.kind).toBe('selling')
  })

  test('a till that reloaded replaces the old one, and the old one cannot come back', () => {
    const { receiver } = setup()
    receiver.receive(state({ sessionId: 'old', seq: 40, at: 1_000 }))
    receiver.receive(state({ sessionId: 'new', seq: 1, at: 2_000, state: { kind: 'idle' } }))
    expect(receiver.view()?.state.kind).toBe('idle')

    expect(receiver.receive(state({ sessionId: 'old', seq: 41, at: 1_500 }))).toBe(false)
    expect(receiver.view()?.state.kind).toBe('idle')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && bun test src/features/customer-display/lib/publisher.test.ts src/features/customer-display/lib/receiver.test.ts`
Expected: FAIL (cannot find modules `./channel`, `./publisher`, `./receiver`).

- [ ] **Step 4: Write the channel**

Create `apps/web/src/features/customer-display/lib/channel.ts`:

```ts
import { CHANNEL_NAME, type DisplayMessage } from './display-state'

/** The wire between the till and the customer's screen. An interface so tests can use the in-memory bus. */
export interface DisplayChannel {
  post(message: DisplayMessage): void
  /** Calls `listener` with every message another endpoint sends; returns the function that stops it. */
  subscribe(listener: (message: unknown) => void): () => void
  close(): void
}

export const isChannelSupported = () => typeof BroadcastChannel !== 'undefined'

/** Same origin, same browser profile: nothing leaves the computer and no server is involved. */
export function openBroadcastChannel(): DisplayChannel {
  const channel = new BroadcastChannel(CHANNEL_NAME)
  return {
    post: (message) => channel.postMessage(message),
    subscribe(listener) {
      const handler = (event: MessageEvent) => listener(event.data)
      channel.addEventListener('message', handler)
      return () => channel.removeEventListener('message', handler)
    },
    close: () => channel.close(),
  }
}

/**
 * An in-memory stand-in for the browser channel, for tests: what one endpoint posts, every other endpoint
 * on the bus receives, as a copy, and never the sender itself, like a real BroadcastChannel.
 */
export function createMemoryBus() {
  type Listener = (message: unknown) => void
  const endpoints = new Set<{ listeners: Set<Listener> }>()
  return {
    open(): DisplayChannel {
      const self = { listeners: new Set<Listener>() }
      endpoints.add(self)
      return {
        post(message) {
          const copy = structuredClone(message)
          for (const endpoint of endpoints) {
            if (endpoint === self) continue
            for (const listener of endpoint.listeners) listener(copy)
          }
        },
        subscribe(listener) {
          self.listeners.add(listener)
          return () => void self.listeners.delete(listener)
        },
        close() {
          self.listeners.clear()
          endpoints.delete(self)
        },
      }
    },
  }
}
```

- [ ] **Step 5: Write the publisher**

Create `apps/web/src/features/customer-display/lib/publisher.ts`:

```ts
import type { DisplayChannel } from './channel'
import { ENVELOPE_VERSION, HEARTBEAT_MS, parseMessage, type DisplayView } from './display-state'

/** Calls `run` every `everyMs` until the returned function is called. Injected so tests fire it by hand. */
export type Scheduler = (run: () => void, everyMs: number) => () => void

const everyInterval: Scheduler = (run, everyMs) => {
  const id = setInterval(run, everyMs)
  return () => clearInterval(id)
}

export interface PublisherOptions {
  channel: DisplayChannel
  /** Names this till window; a reload makes a new one. */
  sessionId: string
  now?: () => number
  schedule?: Scheduler
}

/** The till's side: remembers what is on the counter and keeps every customer screen up to date with it. */
export class DisplayPublisher {
  private seq = 0
  private latest: DisplayView | null = null
  private stopListening: (() => void) | null = null
  private stopHeartbeat: (() => void) | null = null

  constructor(private readonly options: PublisherOptions) {}

  start() {
    const { channel, schedule = everyInterval } = this.options
    // A screen that opens (or reloads) asks, and gets the latest state at once.
    this.stopListening = channel.subscribe((raw) => {
      if (parseMessage(raw)?.type === 'hello') this.send()
    })
    // Repeating the state lets a screen notice that the till has gone quiet.
    this.stopHeartbeat = schedule(() => this.send(), HEARTBEAT_MS)
  }

  update(view: DisplayView) {
    this.latest = view
    this.send()
  }

  /** The till is closing or reloading: do not leave its last basket in front of the next customer. */
  leave() {
    if (this.latest === null) return
    this.latest = { ...this.latest, state: { kind: 'idle' } }
    this.send()
  }

  stop() {
    this.stopListening?.()
    this.stopHeartbeat?.()
    this.stopListening = null
    this.stopHeartbeat = null
  }

  private send() {
    if (this.latest === null) return
    const { channel, sessionId, now = Date.now } = this.options
    this.seq += 1
    channel.post({
      type: 'state',
      envelope: { v: ENVELOPE_VERSION, sessionId, seq: this.seq, at: now(), ...this.latest },
    })
  }
}
```

- [ ] **Step 6: Write the receiver**

Create `apps/web/src/features/customer-display/lib/receiver.ts`:

```ts
import { isStale, parseMessage, pickNewer, type DisplayEnvelope } from './display-state'

/** The display's side: believes the newest valid message, and goes idle when the till falls silent. */
export class DisplayReceiver {
  private current: DisplayEnvelope | null = null
  private heardAt = 0
  private idleView: DisplayEnvelope | null = null

  constructor(private readonly now: () => number = Date.now) {}

  /** Takes one raw message from the wire. Returns true when what is shown may have changed. */
  receive(raw: unknown): boolean {
    const message = parseMessage(raw)
    if (message?.type !== 'state') return false
    const next = pickNewer(this.current, message.envelope)
    if (next === this.current) return false
    this.current = next
    this.idleView = null
    this.heardAt = this.now()
    return true
  }

  /** What to draw now: the last state, or an idle screen (same shop, nothing on it) once the till is quiet. */
  view(): DisplayEnvelope | null {
    if (this.current === null) return null
    if (!isStale(this.now(), this.heardAt)) return this.current
    // Memoised so a once-a-second refresh hands React the same object and nothing re-renders.
    this.idleView ??= { ...this.current, state: { kind: 'idle' } }
    return this.idleView
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/web && bun test src/features/customer-display`
Expected: PASS (display-state, publisher and receiver tests).

- [ ] **Step 8: Typecheck and commit**

Run: `bun run typecheck` — Expected: exit 0 for all packages.

```bash
git add apps/web/src/features/customer-display/lib/channel.ts apps/web/src/features/customer-display/lib/publisher.ts apps/web/src/features/customer-display/lib/receiver.ts apps/web/src/features/customer-display/lib/publisher.test.ts apps/web/src/features/customer-display/lib/receiver.test.ts
gitcz --non-interactive --type=feat --scope=web --subject="add the customer display publisher and receiver" --body="Framework-free classes over a DisplayChannel interface: the till publishes its state, answers hello and repeats it on a heartbeat; the display keeps the newest valid message and goes idle when the till is quiet. Tested over an in-memory bus.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The customer's page, hooks, text and route

**Files:**
- Create: `apps/web/src/features/customer-display/locales.ts`
- Create: `apps/web/src/features/customer-display/lib/open-display.ts`
- Create: `apps/web/src/features/customer-display/hooks/use-customer-display-publisher.ts`
- Create: `apps/web/src/features/customer-display/hooks/use-display-receiver.ts`
- Create: `apps/web/src/features/customer-display/hooks/use-screen-chrome.ts`
- Create: `apps/web/src/features/customer-display/components/CustomerDisplayPage.tsx`
- Create: `apps/web/src/features/customer-display/index.ts`
- Modify: `apps/web/src/app/i18n.ts`
- Modify: `apps/web/src/app/App.tsx`

**Interfaces:**
- Consumes (Tasks 1–2): `DisplayView`, `DisplayEnvelope`, `DisplayLine`, `DisplayPublisher`, `DisplayReceiver`, `isChannelSupported`, `openBroadcastChannel`.
- Produces (used by Task 4): from `@/features/customer-display`: `CustomerDisplayPage`, `useCustomerDisplayPublisher(view: DisplayView): void`, `openCustomerDisplay(): void`, `isCustomerDisplaySupported(): boolean`, `PAID_SHOWN_MS`, types `DisplayState`, `DisplayView`, `DisplayQr`, `DisplayLine`, and `customerDisplayLocales`.

This task has no unit test: the page is a view over logic already tested in Tasks 1–2. It is checked by typecheck, lint and a screenshot pass (Step 9).

- [ ] **Step 1: Write the text**

Create `apps/web/src/features/customer-display/locales.ts`:

```ts
const th = {
  brand: 'EasyPOS',
  fullscreen: 'คลิกที่จอเพื่อเต็มจอ',
  idle: {
    welcome: 'ยินดีต้อนรับ',
  },
  selling: {
    subtotal: 'รวม',
    discount: 'ส่วนลด',
    vatIncluded: 'รวมภาษีมูลค่าเพิ่ม',
    vatAdded: 'ภาษีมูลค่าเพิ่ม',
    total: 'ยอดสุทธิ',
  },
  paying: {
    due: 'ยอดที่ต้องจ่าย',
    scan: 'สแกนเพื่อชำระ',
    qrAlt: 'QR สำหรับชำระเงิน',
    expires: 'หมดอายุเวลา {{time}}',
  },
  paid: {
    title: 'ชำระแล้ว',
    thanks: 'ขอบคุณที่ใช้บริการ',
    change: 'เงินทอน',
  },
}

const en = {
  brand: 'EasyPOS',
  fullscreen: 'Click the screen for full screen',
  idle: {
    welcome: 'Welcome',
  },
  selling: {
    subtotal: 'Subtotal',
    discount: 'Discount',
    vatIncluded: 'VAT included',
    vatAdded: 'VAT',
    total: 'Total',
  },
  paying: {
    due: 'Amount due',
    scan: 'Scan to pay',
    qrAlt: 'Payment QR code',
    expires: 'Expires at {{time}}',
  },
  paid: {
    title: 'Paid',
    thanks: 'Thank you',
    change: 'Change',
  },
} satisfies typeof th

export const locales = { th, en }
```

- [ ] **Step 2: Write the window opener and the till hook**

Create `apps/web/src/features/customer-display/lib/open-display.ts`:

```ts
/** Opens the customer's screen in its own window; a window with this name is reused if it is already open. */
export function openCustomerDisplay() {
  window.open('/customer', 'easypos-customer', 'popup=yes,width=1280,height=720')
}
```

Create `apps/web/src/features/customer-display/hooks/use-customer-display-publisher.ts`:

```ts
import { useEffect, useRef } from 'react'
import { isChannelSupported, openBroadcastChannel } from '../lib/channel'
import type { DisplayView } from '../lib/display-state'
import { DisplayPublisher } from '../lib/publisher'

/**
 * Keeps every customer screen on this computer showing `view`. Call it from the till with what is on the
 * counter now; it sends only when the view changes, and tells the screens to go idle when the till closes.
 */
export function useCustomerDisplayPublisher(view: DisplayView) {
  const publisher = useRef<DisplayPublisher | null>(null)

  useEffect(() => {
    if (!isChannelSupported()) return
    const channel = openBroadcastChannel()
    const instance = new DisplayPublisher({ channel, sessionId: crypto.randomUUID() })
    instance.start()
    publisher.current = instance
    const leave = () => instance.leave()
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      instance.leave()
      instance.stop()
      channel.close()
      publisher.current = null
    }
  }, [])

  // The view is rebuilt on every render; only a change of its content is worth a message.
  const serialized = JSON.stringify(view)
  useEffect(() => {
    publisher.current?.update(JSON.parse(serialized) as DisplayView)
  }, [serialized])
}
```

- [ ] **Step 3: Write the display hooks**

Create `apps/web/src/features/customer-display/hooks/use-display-receiver.ts`:

```ts
import { useEffect, useState } from 'react'
import { isChannelSupported, openBroadcastChannel } from '../lib/channel'
import type { DisplayEnvelope } from '../lib/display-state'
import { DisplayReceiver } from '../lib/receiver'

/** What the till last sent (or an idle screen once it has gone quiet); null until it has spoken. */
export function useDisplayReceiver(): DisplayEnvelope | null {
  const [view, setView] = useState<DisplayEnvelope | null>(null)

  useEffect(() => {
    if (!isChannelSupported()) return
    const receiver = new DisplayReceiver()
    const channel = openBroadcastChannel()
    const refresh = () => setView(receiver.view())
    const stop = channel.subscribe((raw) => {
      if (receiver.receive(raw)) refresh()
    })
    // The screen can go idle through silence alone, with no message to trigger a render.
    const timer = setInterval(refresh, 1_000)
    // Ask for the current state: this window may have opened after the till last spoke.
    channel.post({ type: 'hello' })
    return () => {
      clearInterval(timer)
      stop()
      channel.close()
    }
  }, [])

  return view
}
```

Create `apps/web/src/features/customer-display/hooks/use-screen-chrome.ts`:

```ts
import { useEffect, useState } from 'react'

/** True once the pointer has been still for `afterMs`, so the cursor can be hidden from the customer. */
export function useIdleCursor(afterMs: number) {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), afterMs)
    const wake = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), afterMs)
    }
    window.addEventListener('mousemove', wake)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousemove', wake)
    }
  }, [afterMs])

  return idle
}

/** Whether the window is full screen, and a way to enter it (browsers only allow it from a click). */
export function useFullscreen() {
  const [active, setActive] = useState(() => document.fullscreenElement !== null)

  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const enter = () => {
    if (document.fullscreenElement === null) void document.documentElement.requestFullscreen().catch(() => {})
  }

  return { active, enter }
}
```

- [ ] **Step 4: Write the page**

Create `apps/web/src/features/customer-display/components/CustomerDisplayPage.tsx`:

```tsx
import { Check } from 'lucide-react'
import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { createDateFormat, createMoney, type Locale, type Money } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useDisplayReceiver } from '../hooks/use-display-receiver'
import { useFullscreen, useIdleCursor } from '../hooks/use-screen-chrome'
import type { DisplayLine, DisplayState } from '../lib/display-state'

// One unit that follows the height of the screen, so the text is as large as the screen allows at 1 to 2 metres.
const UNIT = { '--u': 'clamp(12px, 1.9vh, 28px)' } as CSSProperties
const size = {
  label: 'text-[length:calc(var(--u)*1.2)]',
  row: 'text-[length:calc(var(--u)*1.75)]',
  title: 'text-[length:calc(var(--u)*3.2)]',
  total: 'text-[length:calc(var(--u)*4.7)]',
} as const

const IDLE: DisplayState = { kind: 'idle' }

/** The screen the customer faces. It shows only what the till sends and asks the server for nothing. */
export function CustomerDisplayPage() {
  const { t, i18n } = useTranslation('customerDisplay')
  const view = useDisplayReceiver()
  const hidden = useIdleCursor(3_000)
  const fullscreen = useFullscreen()

  const locale: Locale = view?.locale ?? (i18n.language === 'en' ? 'en' : 'th')
  useEffect(() => {
    // The shop chooses the language; follow what the till says without writing the till's saved choice.
    void i18n.changeLanguage(locale)
    document.documentElement.lang = locale
  }, [i18n, locale])

  const currency = view?.currency ?? 'THB'
  const money = useMemo(() => createMoney(currency, locale), [currency, locale])
  const clock = useMemo(() => createDateFormat(locale), [locale])
  const state = view?.state ?? IDLE
  const shopName = view?.shopName || t('brand')

  return (
    <div
      style={UNIT}
      onClick={fullscreen.enter}
      className={cn('flex h-svh flex-col overflow-hidden bg-canvas text-foreground select-none', hidden && 'cursor-none')}
    >
      <header className={cn('shrink-0 px-[3vh] pt-[2.5vh] font-semibold', size.row)}>{shopName}</header>

      {/* Keyed by the kind of screen, so a change fades in; users who ask for less motion get none. */}
      <main key={state.kind} className="flex min-h-0 flex-1 flex-col p-[3vh] motion-safe:animate-in motion-safe:fade-in">
        {state.kind === 'idle' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-[2vh] text-center">
            <p className={cn('font-semibold', size.title)}>{shopName}</p>
            <p className={cn('text-muted-foreground', size.row)}>{t('idle.welcome')}</p>
          </div>
        )}

        {state.kind === 'selling' && (
          <div className="grid min-h-0 flex-1 gap-[3vh] lg:grid-cols-[3fr_2fr]">
            <Lines lines={state.lines} money={money} />
            <Summary
              rows={[
                [t('selling.subtotal'), money.format(state.subtotalSatang)],
                ...(state.discountSatang > 0 ? [[t('selling.discount'), `−${money.format(state.discountSatang)}`] as const] : []),
                ...(state.vatMode !== 'none' && state.vatSatang > 0
                  ? [[state.vatMode === 'inclusive' ? t('selling.vatIncluded') : t('selling.vatAdded'), money.format(state.vatSatang)] as const]
                  : []),
              ]}
              totalLabel={t('selling.total')}
              total={money.format(state.totalSatang)}
            />
          </div>
        )}

        {state.kind === 'paying' && (
          <div className="grid min-h-0 flex-1 gap-[3vh] lg:grid-cols-[3fr_2fr]">
            <Lines lines={state.lines} money={money} />
            <section className="flex min-h-0 flex-col items-center justify-center gap-[2vh] rounded-xl border bg-card p-[3vh] text-center shadow-xs">
              {state.qr && (
                <>
                  <p className={cn('font-semibold', size.row)}>{t('paying.scan')}</p>
                  <img
                    src={`data:image/png;base64,${state.qr.image}`}
                    alt={t('paying.qrAlt')}
                    className="aspect-square max-h-[48vh] min-h-0 rounded-xl bg-white p-[1.5vh]"
                  />
                </>
              )}
              <p className={cn('text-muted-foreground', size.label)}>{t('paying.due')}</p>
              <p className={cn('font-semibold tabular-nums', state.qr ? size.title : size.total)}>{money.format(state.totalSatang)}</p>
              {state.qr && (
                <p className={cn('text-muted-foreground tabular-nums', size.label)}>
                  {t('paying.expires', { time: clock.time(state.qr.expiresAt) })}
                </p>
              )}
            </section>
          </div>
        )}

        {state.kind === 'paid' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-[2.5vh] text-center">
            <span className="flex size-[16vh] items-center justify-center rounded-full bg-success/10 text-success">
              <Check className="size-[9vh]" strokeWidth={2.5} aria-hidden />
            </span>
            <p className={cn('font-semibold', size.title)}>{t('paid.title')}</p>
            <p className={cn('text-muted-foreground', size.row)}>{t('paid.thanks')}</p>
            {state.changeSatang > 0 && (
              <p className={cn('tabular-nums', size.row)}>
                <span className="text-muted-foreground">{t('paid.change')} </span>
                <span className="font-semibold">{money.format(state.changeSatang)}</span>
              </p>
            )}
          </div>
        )}
      </main>

      {!fullscreen.active && (
        <footer className={cn('shrink-0 pb-[1.5vh] text-center text-muted-foreground', size.label)}>{t('fullscreen')}</footer>
      )}
    </div>
  )
}

/** The items so far. The newest stays in view, so a long basket scrolls instead of being cut off. */
function Lines({ lines, money }: { lines: DisplayLine[]; money: Money }) {
  const box = useRef<HTMLUListElement>(null)
  const lastQuantity = lines[lines.length - 1]?.quantity
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [lines.length, lastQuantity])

  return (
    <ul ref={box} className="min-h-0 divide-y overflow-y-auto rounded-xl border bg-card shadow-xs">
      {lines.map((line, index) => (
        <li key={index} className={cn('flex items-baseline gap-[2vh] px-[2.5vh] py-[1.6vh]', size.row)}>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 font-medium">{line.name}</p>
            {line.options.length > 0 && (
              <p className={cn('line-clamp-1 text-muted-foreground', size.label)}>{line.options.join(' · ')}</p>
            )}
          </div>
          <span className="shrink-0 text-muted-foreground tabular-nums">×{line.quantity}</span>
          <span className="w-[8ch] shrink-0 text-right font-medium tabular-nums">{money.plain(line.lineTotalSatang)}</span>
        </li>
      ))}
    </ul>
  )
}

/** The figures beside the items, with the total as the largest thing on the screen. */
function Summary({
  rows,
  totalLabel,
  total,
}: {
  rows: readonly (readonly [string, string])[]
  totalLabel: string
  total: string
}) {
  return (
    <section className="flex min-h-0 flex-col justify-end gap-[1.6vh] rounded-xl border bg-card p-[3vh] shadow-xs">
      {rows.map(([label, value]) => (
        <p key={label} className={cn('flex items-baseline justify-between gap-[2vh] tabular-nums', size.row)}>
          <span className="text-muted-foreground">{label}</span>
          <span>{value}</span>
        </p>
      ))}
      <div className="border-t pt-[2vh]">
        <p className={cn('text-muted-foreground', size.label)}>{totalLabel}</p>
        <p className={cn('font-semibold tabular-nums', size.total)}>{total}</p>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Write the feature's public surface**

Create `apps/web/src/features/customer-display/index.ts`:

```ts
export { CustomerDisplayPage } from './components/CustomerDisplayPage'
export { useCustomerDisplayPublisher } from './hooks/use-customer-display-publisher'
export { isChannelSupported as isCustomerDisplaySupported } from './lib/channel'
export { PAID_SHOWN_MS } from './lib/display-state'
export type { DisplayLine, DisplayQr, DisplayState, DisplayView } from './lib/display-state'
export { openCustomerDisplay } from './lib/open-display'
export { locales as customerDisplayLocales } from './locales'
```

- [ ] **Step 6: Register the text**

In `apps/web/src/app/i18n.ts`:

1. After the line `import { categoriesLocales } from '@/features/categories'` add:
   `import { customerDisplayLocales } from '@/features/customer-display'`
2. In the `th` resources, after `categories: categoriesLocales.th,` add `customerDisplay: customerDisplayLocales.th,`
3. In the `en` resources, after `categories: categoriesLocales.en,` add `customerDisplay: customerDisplayLocales.en,`

- [ ] **Step 7: Render `/customer` before the sign-in gate**

In `apps/web/src/app/App.tsx`:

1. Change `import { Navigate, Route, Routes } from 'react-router'` to `import { Navigate, Route, Routes, useLocation } from 'react-router'`.
2. After the line `import { CategoriesPage } from '@/features/categories'` add `import { CustomerDisplayPage } from '@/features/customer-display'`.
3. Replace the final `export default function App() { ... }` with:

```tsx
function Gate() {
  const me = useQuery(meQuery)
  const setup = useQuery(setupStatusQuery)

  if (me.isPending || setup.isPending) return <AppSkeleton />
  // Settings need a session, so they are only requested once someone is signed in.
  if (!me.data) return setup.data ? <SetupPage /> : <LoginPage />

  return <Shell user={me.data} />
}

export default function App() {
  const { pathname } = useLocation()
  // The customer's screen shows only what the till sends it over the browser channel, so it needs no
  // sign-in and asks the server for nothing: it must also work when the cashier's session has expired.
  if (pathname === '/customer') return <CustomerDisplayPage />
  return <Gate />
}
```

(Keep the existing `useQuery`, `meQuery` and `setupStatusQuery` imports: `Gate` uses them.)

- [ ] **Step 8: Typecheck and lint**

Run: `bun run typecheck` — Expected: all packages exit 0.
Run: `bun run lint` — Expected: exit 0 with no new warnings in `customer-display/`.
Run: `cd apps/web && bun test` — Expected: all pass.

- [ ] **Step 9: Look at the four screens (no database needed)**

The page needs no API, so Vite alone is enough. Create a throwaway `apps/web/customer-display-shots.tmp.ts` (deleted in Step 10):

```ts
// Throwaway: posts each state to /customer over the real BroadcastChannel and takes screenshots.
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const OUT = process.argv[2]!
const WEB = 'http://localhost:5392'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const lines = [
  { name: 'กาแฟเย็น', options: ['หวานน้อย', 'เพิ่มช็อต'], quantity: 2, lineTotalSatang: 14000 },
  { name: 'ช็อกโกแลตแท่ง', options: [], quantity: 1, lineTotalSatang: 2500 },
  { name: 'น้ำดื่ม 600 มล.', options: [], quantity: 1, lineTotalSatang: 1000 },
]
const many = Array.from({ length: 24 }, (_, index) => ({ name: `สินค้าตัวอย่างลำดับที่ ${index + 1}`, options: [], quantity: 1, lineTotalSatang: 1500 }))
const selling = (rows = lines) => ({ kind: 'selling', lines: rows, subtotalSatang: 17500, discountSatang: 1000, vatSatang: 1084, vatMode: 'inclusive', totalSatang: 16500 })
const states: [string, unknown][] = [
  ['idle', { kind: 'idle' }],
  ['selling', selling()],
  ['selling-long', selling(many)],
  ['paying-qr', { kind: 'paying', lines, totalSatang: 16500, qr: { image: PNG, expiresAt: new Date(Date.now() + 300_000).toISOString() } }],
  ['paying-cash', { kind: 'paying', lines, totalSatang: 16500, qr: null }],
  ['paid', { kind: 'paid', totalSatang: 16500, changeSatang: 3500 }],
]
const sizes = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '390x844', width: 390, height: 844 },
]

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let apiCalls = 0
try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: 'th-TH' })
    const display = await context.newPage()
    display.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls += 1 })
    await display.goto(`${WEB}/customer`, { waitUntil: 'commit', timeout: 60_000 })
    const sender = await context.newPage()
    await sender.goto(`${WEB}/customer`, { waitUntil: 'commit', timeout: 60_000 })
    await display.waitForTimeout(1500)
    let seq = 0
    for (const [name, state] of states) {
      seq += 1
      const envelope = { v: 1, sessionId: 'shots', seq, at: Date.now(), locale: 'th', currency: 'THB', shopName: 'ร้านตัวอย่าง', state }
      await sender.evaluate((message) => {
        const channel = new BroadcastChannel('easypos-customer-display')
        channel.postMessage(message)
        channel.close()
      }, { type: 'state', envelope })
      await display.waitForTimeout(700)
      await display.screenshot({ path: `${OUT}/${size.name}-${name}.png` })
    }
    await context.close()
  }
} finally {
  await browser.close()
}
console.log(`done; API requests made by the customer page: ${apiCalls}`)
```

Run it:

```bash
cd apps/web
(bun x vite --port 5392 --strictPort > /dev/null 2>&1 &)
sleep 6
bun ./customer-display-shots.tmp.ts "$TEMP/customer-display-shots"
```

Expected: `done; API requests made by the customer page: 0`. Then open the PNGs (`1920x1080-selling.png`, `…-paying-qr.png`, `…-paid.png`, `1024x768-selling.png`, `390x844-selling-long.png`) and check by eye: the total is the largest text; the long basket scrolls with the newest line in view; the QR sits on white; nothing overflows horizontally; the stacked layout at 390 px keeps the total visible.

- [ ] **Step 10: Clean up and commit**

```bash
rm -f apps/web/customer-display-shots.tmp.ts
# stop the Vite server started in Step 9 (PowerShell): Get-NetTCPConnection -LocalPort 5392 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }
git status --short   # only the files of this task
git add apps/web/src/features/customer-display apps/web/src/app/App.tsx apps/web/src/app/i18n.ts
gitcz --non-interactive --type=feat --scope=web --subject="add the customer display page and its route" --body="/customer renders before the sign-in gate and makes no API request. Idle, selling, paying (with the bank QR) and paid screens, sized from the screen height, with an idle cursor and click-for-fullscreen.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The till publishes to the customer screen

**Files:**
- Create: `apps/web/src/features/pos/lib/customer-display.ts`
- Test: `apps/web/src/features/pos/lib/customer-display.test.ts`
- Modify: `apps/web/src/features/pos/components/PaymentDialog.tsx`
- Modify: `apps/web/src/features/pos/components/PosPage.tsx`
- Modify: `apps/web/src/features/pos/locales.ts`

**Interfaces:**
- Consumes (Task 3): from `@/features/customer-display`: `useCustomerDisplayPublisher`, `openCustomerDisplay`, `isCustomerDisplaySupported`, `PAID_SHOWN_MS`, types `DisplayState`, `DisplayQr`. From `../lib/cart`: `PricedCart`.
- Produces: `toDisplayState(input: CustomerDisplayInput): DisplayState`; `PaymentDialog` gains the optional prop `onQrChange?: (qr: DisplayQr | null) => void`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/pos/lib/customer-display.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import type { PricedCart, PricedLine } from './cart'
import { toDisplayState, type CustomerDisplayInput } from './customer-display'

const line = (overrides: Partial<PricedLine> = {}): PricedLine => ({
  lineKey: '1:3',
  lineId: null,
  productId: 1,
  name: 'กาแฟเย็น',
  unitPriceSatang: 3500,
  quantity: 2,
  lineTotalSatang: 7000,
  options: [{ name: 'หวานน้อย', priceSatang: 0 }],
  optionIds: [3],
  exceedsStock: false,
  stockQty: 50,
  unavailable: false,
  ...overrides,
})

const cart = (lines: PricedLine[] = [line()], overrides: Partial<PricedCart> = {}): PricedCart => ({
  lines,
  itemCount: lines.reduce((sum, item) => sum + item.quantity, 0),
  subtotalSatang: lines.reduce((sum, item) => sum + item.lineTotalSatang, 0),
  discountSatang: 0,
  isDiscountValid: true,
  vatSatang: 458,
  totalSatang: lines.reduce((sum, item) => sum + item.lineTotalSatang, 0),
  canPay: lines.length > 0,
  ...overrides,
})

const input = (overrides: Partial<CustomerDisplayInput> = {}): CustomerDisplayInput => ({
  cart: cart(),
  vatMode: 'inclusive',
  isPaying: false,
  qr: null,
  paidSale: null,
  ...overrides,
})

const QR = { image: 'iVBORw0KGgo=', expiresAt: '2026-10-14T10:35:00.000Z' }

describe('toDisplayState', () => {
  test('an empty till with nothing just sold is idle', () => {
    expect(toDisplayState(input({ cart: cart([]) }))).toEqual({ kind: 'idle' })
  })

  test('a cart is shown as a sale with the figures the receipt will carry', () => {
    expect(toDisplayState(input({ cart: cart([line()], { discountSatang: 500, totalSatang: 6500 }) }))).toEqual({
      kind: 'selling',
      lines: [{ name: 'กาแฟเย็น', options: ['หวานน้อย'], quantity: 2, lineTotalSatang: 7000 }],
      subtotalSatang: 7000,
      discountSatang: 500,
      vatSatang: 458,
      vatMode: 'inclusive',
      totalSatang: 6500,
    })
  })

  test('carries only what a customer may see: no ids, stock or unit prices', () => {
    const state = toDisplayState(input())
    if (state.kind !== 'selling') throw new Error('expected a sale')
    expect(Object.keys(state.lines[0]!).sort()).toEqual(['lineTotalSatang', 'name', 'options', 'quantity'])
  })

  test('with the payment dialog open it is paying, with the QR the customer can scan', () => {
    expect(toDisplayState(input({ isPaying: true, qr: QR }))).toMatchObject({ kind: 'paying', totalSatang: 7000, qr: QR })
    expect(toDisplayState(input({ isPaying: true }))).toMatchObject({ kind: 'paying', qr: null })
  })

  test('just after a sale, with an empty cart, it says paid with the change', () => {
    const state = toDisplayState(input({ cart: cart([]), paidSale: { totalSatang: 7000, changeSatang: 3000 } }))
    expect(state).toEqual({ kind: 'paid', totalSatang: 7000, changeSatang: 3000 })
  })

  test('a new sale started while "paid" is still showing wins over it', () => {
    const state = toDisplayState(input({ paidSale: { totalSatang: 7000, changeSatang: 0 } }))
    expect(state.kind).toBe('selling')
  })

  test('an open payment dialog over an emptied cart is not "paying"', () => {
    expect(toDisplayState(input({ cart: cart([]), isPaying: true, qr: QR }))).toEqual({ kind: 'idle' })
    expect(toDisplayState(input({ cart: cart([]), isPaying: true, paidSale: { totalSatang: 100, changeSatang: 0 } })).kind).toBe('paid')
  })

  test('a free sale shows a zero total and no QR', () => {
    const free = cart([line({ lineTotalSatang: 0, unitPriceSatang: 0 })], { totalSatang: 0, vatSatang: 0 })
    expect(toDisplayState(input({ cart: free, isPaying: true }))).toMatchObject({ kind: 'paying', totalSatang: 0, qr: null })
    expect(toDisplayState(input({ cart: free }))).toMatchObject({ kind: 'selling', totalSatang: 0 })
  })

  test('passes the shop VAT mode so the screen can label the tax', () => {
    expect(toDisplayState(input({ vatMode: 'exclusive' }))).toMatchObject({ vatMode: 'exclusive' })
    expect(toDisplayState(input({ vatMode: 'none' }))).toMatchObject({ vatMode: 'none' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bun test src/features/pos/lib/customer-display.test.ts`
Expected: FAIL (cannot find module `./customer-display`).

- [ ] **Step 3: Write the mapper**

Create `apps/web/src/features/pos/lib/customer-display.ts`:

```ts
import type { VatMode } from '@pos/api/pricing'
import type { DisplayQr, DisplayState } from '@/features/customer-display'
import type { PricedCart } from './cart'

export interface CustomerDisplayInput {
  /** What the till is selling, already priced: the same figures the receipt will carry. */
  cart: Pick<PricedCart, 'lines' | 'subtotalSatang' | 'discountSatang' | 'vatSatang' | 'totalSatang'>
  vatMode: VatMode
  /** The payment dialog is open. */
  isPaying: boolean
  /** The bank QR the customer can scan right now, if there is one. */
  qr: DisplayQr | null
  /** A sale was just recorded and is still inside the few seconds "paid" is shown. */
  paidSale: { totalSatang: number; changeSatang: number } | null
}

/**
 * What the customer's screen should show. A sale in progress always wins over "paid", so a customer who
 * walks up while the last "thank you" is still showing sees their own basket, not the previous one.
 * Only receipt-level facts are copied: no product ids, stock or cost.
 */
export function toDisplayState({ cart, vatMode, isPaying, qr, paidSale }: CustomerDisplayInput): DisplayState {
  if (cart.lines.length > 0) {
    const lines = cart.lines.map((line) => ({
      name: line.name,
      options: line.options.map((option) => option.name),
      quantity: line.quantity,
      lineTotalSatang: line.lineTotalSatang,
    }))
    if (isPaying) return { kind: 'paying', lines, totalSatang: cart.totalSatang, qr }
    return {
      kind: 'selling',
      lines,
      subtotalSatang: cart.subtotalSatang,
      discountSatang: cart.discountSatang,
      vatSatang: cart.vatSatang,
      vatMode,
      totalSatang: cart.totalSatang,
    }
  }
  if (paidSale !== null) return { kind: 'paid', ...paidSale }
  return { kind: 'idle' }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bun test src/features/pos/lib/customer-display.test.ts`
Expected: PASS.

- [ ] **Step 5: Let the payment dialog report the QR**

In `apps/web/src/features/pos/components/PaymentDialog.tsx`:

1. In the `Props` interface, after the `shiftId?: number` line (and its comment), add:

```ts
  /**
   * Tells the till which bank QR is showing (or null), so the customer's screen can show the same one.
   * Called again with null when the QR is paid, replaced or the dialog closes.
   */
  onQrChange?: (qr: { image: string; expiresAt: string } | null) => void
```

2. Change the signature to include it:
   `export function PaymentDialog({ totalSatang, isSubmitting, error, onConfirm, onCancel, shiftId, onQrChange }: Props) {`

3. Immediately after the line `const qr = useQrPayment({ amountSatang: totalSatang, active: usesQr, shiftId })` add:

```ts
  // The customer's screen follows the QR on this dialog. It is keyed by the QR's id: a new QR is a new
  // message, and a paid QR (or a closed dialog) clears it.
  const shownQr = usesQr && qr.issued && !qr.paid ? qr.issued : null
  useEffect(() => {
    onQrChange?.(shownQr ? { image: shownQr.image, expiresAt: shownQr.expiresAt.toISOString() } : null)
    return () => onQrChange?.(null)
    // The callback is a state setter, stable by design; only another QR should send again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownQr?.id])
```

(`useEffect` is already imported in this file.)

- [ ] **Step 6: Add the menu text**

In `apps/web/src/features/pos/locales.ts`:

1. In the `th` object, after `moreActions: 'การทำงานอื่น',` add `customerDisplay: 'จอลูกค้า',`
2. In the `en` object, after `moreActions: 'More actions',` add `customerDisplay: 'Customer screen',`

- [ ] **Step 7: Publish from the till and add the menu entry**

In `apps/web/src/features/pos/components/PosPage.tsx`:

1. Change `import { ClipboardList, LayoutGrid, MoreHorizontal } from 'lucide-react'` to
   `import { ClipboardList, LayoutGrid, MoreHorizontal, Monitor } from 'lucide-react'`.
2. Change `import { useFormat } from '@/features/settings'` to
   `import { useFormat, useSettings } from '@/features/settings'`.
3. After that import add:
   `import { isCustomerDisplaySupported, openCustomerDisplay, PAID_SHOWN_MS, useCustomerDisplayPublisher } from '@/features/customer-display'`
4. After `import { hasKeyboard } from '../lib/focus'` add `import { toDisplayState } from '../lib/customer-display'`.
5. Inside `PosPage`, after the line `const [receipt, setReceipt] = useState<Sale | null>(null)` add:

```ts
  const settings = useSettings()
  // The bank QR the payment dialog is showing, and the sale just paid, for the customer's screen.
  const [shownQr, setShownQr] = useState<{ image: string; expiresAt: string } | null>(null)
  const [paidSale, setPaidSale] = useState<{ totalSatang: number; changeSatang: number } | null>(null)

  // "Paid" stays on the customer's screen for a few seconds, then the idle screen returns.
  useEffect(() => {
    if (paidSale === null) return
    const timer = window.setTimeout(() => setPaidSale(null), PAID_SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [paidSale])

  useCustomerDisplayPublisher({
    locale: settings.locale,
    currency: settings.currency,
    shopName: settings.shopName,
    state: toDisplayState({ cart, vatMode: settings.vatMode, isPaying, qr: shownQr, paidSale }),
  })
```

6. In the `paid` object, replace
```ts
    onSuccess: (sale: Sale) => {
      setReceipt(sale)
```
   with
```ts
    onSuccess: (sale: Sale) => {
      setReceipt(sale)
      setPaidSale({ totalSatang: sale.totalSatang, changeSatang: sale.changeSatang })
```
7. On the wide-screen header, immediately after the "orders" `</Button>` (the one containing `t('orders.button')` and the `openCount` badge, inside `<div className="hidden items-center gap-2 sm:flex">`) add:

```tsx
          {isCustomerDisplaySupported() && (
            <Button variant="outline" className="h-11 px-3" onClick={openCustomerDisplay}>
              <Monitor />
              {t('customerDisplay')}
            </Button>
          )}
```
8. In the `DropdownMenuContent`, after the "orders" `DropdownMenuItem` add:

```tsx
            {isCustomerDisplaySupported() && (
              <DropdownMenuItem onSelect={openCustomerDisplay}>
                <Monitor />
                {t('customerDisplay')}
              </DropdownMenuItem>
            )}
```
9. On the `<PaymentDialog` element add the prop `onQrChange={setShownQr}`.

- [ ] **Step 8: Typecheck, lint and test**

Run: `bun run typecheck` — Expected: all packages exit 0.
Run: `bun run lint` — Expected: exit 0, no new warnings in the touched files.
Run: `cd apps/web && bun test` — Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/pos/lib/customer-display.ts apps/web/src/features/pos/lib/customer-display.test.ts apps/web/src/features/pos/components/PaymentDialog.tsx apps/web/src/features/pos/components/PosPage.tsx apps/web/src/features/pos/locales.ts
gitcz --non-interactive --type=feat --scope=web --subject="publish the sale to the customer screen from the till" --body="A pure mapper turns the priced cart into the display state (a sale in progress always wins over paid). The payment dialog reports its bank QR, the till times the paid screen, and the header and mobile menu open the customer window.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Browser check, screenshots and documentation

**Files:**
- Modify: `apps/web/e2e/run.ts`
- Modify: `apps/web/e2e/shots.ts`
- Modify: `DESIGN.md`
- Modify: `docs/summary.md`

**Interfaces:**
- Consumes: the finished feature from Tasks 1–4.
- Produces: nothing used later.

- [ ] **Step 1: Add the browser check**

In `apps/web/e2e/run.ts`, immediately after the check named `'on a phone the cashier sells with the cart bar: open the cart, change the quantity both ways, pay'` (its closing `})`), add:

```ts
    await check('the customer screen needs no sign-in, then follows the cashier: the item and total, then paid, then idle', async () => {
      // A stranger's browser: no session. The screen must neither show a login page nor ask the API for anything.
      const stranger = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'th-TH' })
      try {
        const bare = await stranger.newPage()
        bare.setDefaultTimeout(15_000)
        const apiCalls: string[] = []
        bare.on('request', (request) => {
          if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url())
        })
        await bare.goto(`${WEB}/customer`)
        await bare.getByText('ยินดีต้อนรับ').waitFor()
        if (apiCalls.length > 0) throw new Error(`The customer screen called the API: ${apiCalls[0]}`)
      } finally {
        await stranger.close()
      }

      // In the cashier's own browser the screen follows what is on the counter.
      const display = await cashier.context().newPage()
      display.setDefaultTimeout(15_000)
      try {
        await display.goto(`${WEB}/customer`)
        await cashier.goto(WEB)
        await cashier.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
        await display.getByText('น้ำดื่ม 600 มล.').waitFor()
        await display.getByText('ยอดสุทธิ').waitFor()
        await cashier.getByRole('button', { name: /^ชำระเงิน/ }).click()
        // Not cash: the checks that close the shift assert exactly what the drawer should hold (฿160.00, and
        // a difference of -฿25.00), so this sale must not add to it.
        await cashier.getByRole('button', { name: 'พร้อมเพย์' }).click()
        await cashier.getByRole('button', { name: 'ยืนยันการชำระ' }).click()
        await display.getByText('ชำระแล้ว').waitFor()
        await cashier.getByRole('button', { name: 'ขายรายการต่อไป' }).click()
        // The till ends the paid screen itself after a few seconds.
        await display.getByText('ยินดีต้อนรับ').waitFor({ timeout: 10_000 })
      } finally {
        await display.close()
      }
    })
```

- [ ] **Step 2: Add the four states to the screenshot pass**

In `apps/web/e2e/shots.ts`:

1. Change `import { chromium, type Page } from 'playwright-core'` to
   `import { chromium, type BrowserContext, type Page } from 'playwright-core'`.
2. After the `tryClick` function add:

```ts
/** The customer's screen has no sign-in and no API, so it is fed by posting messages on the real channel. */
async function shootCustomerDisplay(context: BrowserContext, name: string) {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const lines = [
    { name: 'กาแฟเย็น', options: ['หวานน้อย'], quantity: 2, lineTotalSatang: 7000 },
    { name: 'ช็อกโกแลตแท่ง', options: [], quantity: 1, lineTotalSatang: 2500 },
  ]
  const states: [string, unknown][] = [
    ['idle', { kind: 'idle' }],
    ['selling', { kind: 'selling', lines, subtotalSatang: 9500, discountSatang: 0, vatSatang: 621, vatMode: 'inclusive', totalSatang: 9500 }],
    ['paying', { kind: 'paying', lines, totalSatang: 9500, qr: { image: png, expiresAt: new Date(Date.now() + 300_000).toISOString() } }],
    ['paid', { kind: 'paid', totalSatang: 9500, changeSatang: 500 }],
  ]
  const display = await context.newPage()
  const sender = await context.newPage()
  try {
    await display.goto(`${WEB}/customer`)
    await sender.goto(`${WEB}/customer`)
    await display.waitForTimeout(800)
    let seq = 0
    for (const [state, value] of states) {
      seq += 1
      const envelope = { v: 1, sessionId: 'shots', seq, at: Date.now(), locale: 'th', currency: 'THB', shopName: 'EasyPOS', state: value }
      await sender.evaluate((message) => {
        const channel = new BroadcastChannel('easypos-customer-display')
        channel.postMessage(message)
        channel.close()
      }, { type: 'state', envelope })
      await display.waitForTimeout(600)
      await display.screenshot({ path: join(OUT, `${name}-20-customer-${state}.png`) })
    }
  } finally {
    await display.close()
    await sender.close()
  }
}
```

3. Inside the size loop, immediately before `await context.close()`, add:
   `await shootCustomerDisplay(context, size.name)`

- [ ] **Step 3: Document the rules**

In `DESIGN.md`, immediately before the `## Do's and Don'ts` heading, add:

```markdown
## จอลูกค้า

หน้า `/customer` เป็นจอที่สองหันหาลูกค้าที่เคาน์เตอร์ ใช้ได้เฉพาะบนเครื่องและเบราว์เซอร์เดียวกับหน้าขาย (ส่งข้อมูลผ่าน `BroadcastChannel` ชื่อ `easypos-customer-display`) แสดงเท่านั้น ไม่มีปุ่มหรือช่องกรอก

| สถานะ | แสดง |
|---|---|
| ว่าง | ชื่อร้านและข้อความต้อนรับ |
| กำลังขาย | รายการ รวม ส่วนลด ภาษี และยอดสุทธิตัวใหญ่ที่สุด |
| ชำระเงิน | ยอดที่ต้องจ่ายและ QR PromptPay พร้อมเวลาหมดอายุ |
| ชำระแล้ว | เครื่องหมายถูกสีเขียว ข้อความขอบคุณ และเงินทอน แสดง 5 วินาทีแล้วกลับเป็นว่าง |

กฎ:

- ข้อความที่ส่งมีเท่าที่อยู่บนใบเสร็จเท่านั้น: ห้ามเพิ่มต้นทุน กำไร ยอดสต็อก ชื่อแคชเชียร์ หรือรหัสภายในลงใน `DisplayState` ตัวตรวจข้อความตัดฟิลด์ที่ไม่รู้จักทิ้ง
- หน้านี้ไม่เรียก API และไม่ต้องล็อกอิน (อยู่ก่อนประตูล็อกอินของ `App`) จึงไม่มีทางเป็นช่องทางเข้าถึงข้อมูลของร้าน
- ขนาดตัวอักษรตามความสูงจอ (ตัวแปร `--u`) เพื่ออ่านได้จากระยะ 1–2 เมตร ที่ 1080p: แถวรายการ ~36px ยอดสุทธิ ~96px
- สีเขียวใช้กับ "ชำระแล้ว" เท่านั้นและมีเครื่องหมายถูกกับข้อความคู่เสมอ ไม่ใช้ปุ่มสีส้มเพราะไม่มีปุ่ม
- หน้าขายส่งสถานะซ้ำทุก 10 วินาที จอที่เงียบเกิน 30 วินาทีกลับเป็นว่าง กันตะกร้าของลูกค้าคนก่อนค้าง
```

In `docs/summary.md`, in the status table, after the row `| เพิ่มเติม | รายงานย้อนหลัง | ...` add:

```markdown
| เพิ่มเติม | จอลูกค้าที่เคาน์เตอร์ | เสร็จฝั่งโค้ดบน `ohmattpon/customer-display`: หน้า `/customer` อ่านอย่างเดียวสี่สถานะ (ว่าง กำลังขาย ชำระเงินพร้อม QR ชำระแล้ว) ส่งข้อมูลจากหน้าขายผ่าน `BroadcastChannel` ในเบราว์เซอร์เดียวกัน ไม่แตะ API ฐานข้อมูลหรือสัญญา ไม่รองรับอุปกรณ์แยกเครื่องหรือให้ลูกค้าสั่งเอง |
```

- [ ] **Step 4: Check everything that does not need Docker**

Run: `bun run typecheck` — Expected: exit 0 for all packages.
Run: `bun run lint` — Expected: exit 0.
Run: `cd apps/web && bun test` — Expected: all pass.

- [ ] **Step 5: Commit the checks and the documentation**

```bash
git add apps/web/e2e/run.ts apps/web/e2e/shots.ts
gitcz --non-interactive --type=test --scope=web --subject="check the customer screen in the browser" --body="A stranger's browser opens /customer without signing in and without an API call; in the cashier's browser the screen follows the item and total, shows paid, then returns to idle. The screenshot pass records the four states.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git add DESIGN.md docs/summary.md
gitcz --non-interactive --type=docs --scope=web --subject="document the customer display" --body="Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Run the browser check and the full suite (needs Docker; ask the owner first)**

Do not start Docker without asking. Once the owner agrees and the database container is up:

Run: `bun run e2e` — Expected: every check passes, including the new customer-screen check.
Run: `bun run screenshots` — Expected: `*-20-customer-{idle,selling,paying,paid}.png` for each size; look at them.
Run: `bun run test` — Expected: all API and web tests pass.

Report the results as they are, including any check that did not run.

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| 1 Four states and what is shown | Task 3 (page), Task 4 (mapper) |
| 2 Envelope, rules 1–5 (publish on change, hello, heartbeat/stale, pagehide idle, paid timing) | Task 1 (format, stale), Task 2 (publisher/receiver), Task 4 (paid timer, publish on change) |
| 3 Code structure, `pos` changes, `app` changes | Tasks 3 and 4 |
| 4 Look: layout, type scale, colours, scroll, motion, fullscreen, cursor | Task 3 |
| 5 Security (receipt-only data, no API, QR from the till) | Task 1 (validator strips fields), Task 3 (no API), Task 4 (mapper copies only receipt facts) |
| 6 Tests: unit, e2e, screenshots, docs, final checks | Tasks 1, 2, 4 (unit); Task 5 (e2e, screenshots, docs, checks) |
| 7 Risks (same browser only, frozen tab, constants) | Documented in Task 5; stale rule covers the frozen tab |

Spec amendments (validator instead of zod; till-side paid timer) are made in Task 1, Step 1.

**Type consistency:** `DisplayView`, `DisplayEnvelope`, `DisplayState`, `DisplayQr`, `DisplayLine` are defined once in `display-state.ts` and re-exported from the feature `index.ts`; `toDisplayState` returns `DisplayState`; `PaymentDialog.onQrChange` and `PosPage`'s `shownQr` use `{ image: string; expiresAt: string }`, which is structurally `DisplayQr`; `createMemoryBus().open()` returns `DisplayChannel`, which `DisplayPublisher` and the tests use.

**Existing checks protected:** the new browser check pays with PromptPay, not cash, because the shift-closing checks assert exact cash figures (`฿160.00`, `-฿25.00`) that one more cash sale would change.

**Not verified until the owner starts Docker:** the browser check, the screenshots and the full `bun run test`.
