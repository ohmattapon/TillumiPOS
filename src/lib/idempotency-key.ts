import { newUuid } from './uuid'

/** One key per command a person means to send once: a retry of the same command sends the same key. */
export const newIdempotencyKey = (): string => newUuid()

/** The request options that carry the key; no key given means a new command, so a new key. */
export const withIdempotencyKey = (key: string = newIdempotencyKey()) => ({ headers: { 'idempotency-key': key } })
