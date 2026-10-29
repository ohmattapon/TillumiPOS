// Idempotency keys that depend only on where in the test a request is made, so a rerun of the same seed sends
// the same keys. The API wants a UUID (see isIdempotencyKey in the server's command-idempotency.ts).

/** 32-bit FNV-1a of `text`, started from `salt` so four salts give four independent words. */
function fnv1a(text: string, salt: number): number {
  let hash = (0x811c9dc5 ^ Math.imul(salt, 0x9e3779b1)) >>> 0
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0
  return hash
}

/** The key of one command: the same (scenario, vu, iteration, step) always gives the same UUID. */
export function idempotencyKeyFor(scenario: string, vu: number, iteration: number, step: string): string {
  const text = `${scenario}:${vu}:${iteration}:${step}`
  const hex = [1, 2, 3, 4].map((salt) => fnv1a(text, salt).toString(16).padStart(8, '0')).join('')
  // Version 4 and variant bits, which is the shape the API checks.
  const variant = '89ab'[parseInt(hex[16]!, 16) % 4]
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
