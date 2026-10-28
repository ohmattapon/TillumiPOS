import { z } from 'zod'
import { VAT_MODES } from '../../../../domains/pricing'
import { isPairingCode } from '../../../../domains/display-session.domain'

// The limits keep a buggy or hostile till from filling the server's memory, and they match what the screen accepts.
const text = z.string().max(200)
const whole = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

const line = z.object({
  name: text,
  options: z.array(text).max(20),
  quantity: whole.min(1),
  lineTotalSatang: whole,
})

// A QR is one kind or the other: the bank's picture, or the payload of a static PromptPay QR that the screen draws.
const bankQr = z.object({
  // It goes into a data: URL on the screen, so only plain base64 passes.
  image: z.string().max(200_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  expiresAt: z.string().max(40).refine((value) => Number.isFinite(Date.parse(value))),
  payload: z.never().optional(),
})
const staticQr = z.strictObject({
  // An EMV QR is printable ASCII (about 100 characters); the screen draws it as a picture, never as markup.
  payload: z.string().min(1).max(512).regex(/^[\x20-\x7e]+$/),
})
const qr = z.union([bankQr, staticQr])

const state = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idle') }),
  z.object({
    kind: z.literal('selling'),
    lines: z.array(line).max(300),
    subtotalSatang: whole,
    discountSatang: whole,
    vatSatang: whole,
    vatMode: z.enum(VAT_MODES),
    totalSatang: whole,
  }),
  z.object({ kind: z.literal('paying'), lines: z.array(line).max(300), totalSatang: whole, qr: qr.nullable() }),
  z.object({ kind: z.literal('paid'), totalSatang: whole, changeSatang: whole }),
])

/** What the till says is on the counter now: the same envelope the screen already reads from the browser channel. */
export const displayEnvelopeSchema = z.object({
  v: z.literal(1),
  sessionId: z.string().min(1).max(64),
  seq: whole,
  at: whole,
  locale: z.enum(['th', 'en']),
  currency: z.string().min(1).max(8),
  shopName: text,
  state,
})
export type DisplayEnvelope = z.infer<typeof displayEnvelopeSchema>

const registerId = z.number().int().min(1).nullable().optional()

export const pairDisplaySchema = z.object({
  code: z.string().refine(isPairingCode, 'รหัสจับคู่ต้องเป็นตัวเลข 6 หลัก'),
  registerId,
})

export const publishDisplayStateSchema = z.object({ registerId, envelope: displayEnvelopeSchema })

export const displayTargetInputSchema = z.object({ registerId })

export const displayTokenSchema = z.string().min(20).max(100)
