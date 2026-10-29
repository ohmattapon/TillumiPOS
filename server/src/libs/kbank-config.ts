/** Where KBank's sandbox answers. Production is a different host: KBank gives it with the production credentials. */
export const KBANK_SANDBOX_URL = 'https://openapi-sandbox.kasikornbank.com'
export const KBANK_PROD_URL = 'https://openapi.kasikornbank.com'

export interface KbankConfig {
  /** Everything before `/v1/...` and `/v2/...`, without a trailing slash. */
  baseUrl: string
  consumerId: string
  consumerSecret: string
  /** Merchant id KBank hands over after approval. */
  merchantId: string
  partnerId: string
  partnerSecret: string
  /** PEM files for mTLS. Unset in tests, where the fake bank speaks plain HTTP. */
  certPath?: string
  keyPath?: string
  /** Sandbox exercise headers (`x-test-mode`, `env-id`) are sent only when set. */
  testMode: boolean
}

// Example values copied from .env.example must not count as configuration.
const isSet = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== '' && !value.trim().startsWith('your-')

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * The bearer token and partner secrets travel to this host and its answers are what marks a QR paid,
 * so it must be https; plain http is for the fake bank on this machine only. Throws rather than
 * returning null: null means "not configured", which would lift the rule that PromptPay needs a QR.
 */
function checkedBaseUrl(raw: string): string {
  const url = raw.trim().replace(/\/+$/, '')
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('KBANK_API_BASE_URL ไม่ใช่ URL ที่ถูกต้อง')
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname)))
    throw new Error('KBANK_API_BASE_URL ต้องเป็น https:// (http:// ใช้ได้เฉพาะ localhost)')
  return url
}

/**
 * The KBank settings from the environment, or null when QR payment is not configured.
 * Read on every call rather than once at start-up so that tests (and a restart-free edit of the
 * process environment) can switch it on and off; it is a handful of lookups.
 */
export function readKbankConfig(): KbankConfig | null {
  const consumerId = Bun.env.KBANK_CONSUMER_ID
  const consumerSecret = Bun.env.KBANK_CONSUMER_SECRET
  const merchantId = Bun.env.KBANK_MERCHANT_ID
  const partnerId = Bun.env.KBANK_PARTNER_ID
  const partnerSecret = Bun.env.KBANK_PARTNER_SECRET
  if (!isSet(consumerId) || !isSet(consumerSecret) || !isSet(merchantId) || !isSet(partnerId) || !isSet(partnerSecret))
    return null

  const certPath = Bun.env.KBANK_CERT_PATH
  const keyPath = Bun.env.KBANK_KEY_PATH
  return {
    baseUrl: checkedBaseUrl(isSet(Bun.env.KBANK_API_BASE_URL) ? Bun.env.KBANK_API_BASE_URL : KBANK_SANDBOX_URL),
    consumerId: consumerId.trim(),
    consumerSecret: consumerSecret.trim(),
    merchantId: merchantId.trim(),
    partnerId: partnerId.trim(),
    partnerSecret: partnerSecret.trim(),
    ...(isSet(certPath) && { certPath: certPath.trim() }),
    ...(isSet(keyPath) && { keyPath: keyPath.trim() }),
    testMode: Bun.env.KBANK_TEST_MODE === 'true',
  }
}
