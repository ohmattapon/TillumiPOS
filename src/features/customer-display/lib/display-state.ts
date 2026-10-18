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
/** A PromptPay payload is about 100 characters; this leaves room without letting a message grow the screen's work. */
const MAX_QR_PAYLOAD = 512
// The characters of an EMV QR: printable ASCII. The screen draws it as a picture, never as markup.
const QR_PAYLOAD = /^[\x20-\x7e]+$/

/** What the customer may see of one line: what is printed on the receipt, nothing else. */
export interface DisplayLine {
  name: string
  options: string[]
  quantity: number
  lineTotalSatang: number
}

/** A QR the customer can scan: the bank's picture, or the text of a static PromptPay QR that the screen draws itself. */
export type DisplayQr =
  | {
      /** Base64 PNG, as the bank returned it. */
      image: string
      /** ISO time the QR stops being payable. */
      expiresAt: string
    }
  | {
      /** The PromptPay payload with the bill amount in it. Static QRs do not expire: the bank is never asked. */
      payload: string
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
  const { image, expiresAt, payload } = raw
  if (payload !== undefined) {
    // A QR is one kind or the other, so the screen never has to choose between two.
    if (image !== undefined || expiresAt !== undefined) return undefined
    if (typeof payload !== 'string' || payload.length > MAX_QR_PAYLOAD || !QR_PAYLOAD.test(payload)) return undefined
    return { payload }
  }
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
