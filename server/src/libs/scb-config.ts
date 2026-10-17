/** Where SCB's sandbox answers. Production is a different host: SCB gives it with the production credentials. */
export const SCB_SANDBOX_URL = 'https://api-sandbox.partners.scb/partners/sandbox'

export interface ScbConfig {
  /** Everything before `/v1/...`, without a trailing slash. */
  baseUrl: string
  apiKey: string
  apiSecret: string
  /** 15-digit biller id of the merchant profile. */
  billerId: string
  /** Reference 3 prefix of the merchant profile. */
  ref3Prefix: string
  /** Set when the merchant profile is configured for two references, so reference 2 is sent too. */
  twoReferences: boolean
}

// Example values copied from .env.example must not count as configuration.
const isSet = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== '' && !value.trim().startsWith('your-')

/**
 * The SCB settings from the environment, or null when QR payment is not configured.
 * Read on every call rather than once at start-up so that tests (and a restart-free edit of the
 * process environment) can switch it on and off; it is a handful of lookups.
 */
export function readScbConfig(): ScbConfig | null {
  const apiKey = Bun.env.SCB_API_KEY
  const apiSecret = Bun.env.SCB_API_SECRET
  const billerId = Bun.env.SCB_BILLER_ID
  const ref3Prefix = Bun.env.SCB_REF3_PREFIX
  if (!isSet(apiKey) || !isSet(apiSecret) || !isSet(billerId) || !isSet(ref3Prefix)) return null

  return {
    baseUrl: (isSet(Bun.env.SCB_API_BASE_URL) ? Bun.env.SCB_API_BASE_URL : SCB_SANDBOX_URL).replace(/\/+$/, ''),
    apiKey: apiKey.trim(),
    apiSecret: apiSecret.trim(),
    billerId: billerId.trim(),
    ref3Prefix: ref3Prefix.trim().toUpperCase(),
    twoReferences: Bun.env.SCB_TWO_REFERENCES === 'true',
  }
}
