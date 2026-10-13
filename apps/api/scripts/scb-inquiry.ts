// Usage (from the repo root):
//   bun run scb:inquiry <reference1> [yyyy-MM-dd]
//
// Asks SCB, with the credentials in your .env, what it knows about one QR reference and prints exactly
// what it answers. It only reads: it creates no QR and moves no money. Use it to see how the sandbox or
// production answers "not found" and "found", which SCB's documents leave unclear.
//
// Secrets are never printed: the access token is shortened and the key and secret are not shown.
import { readScbConfig } from '../src/libs/scb-config'

const [reference, dateArgument] = Bun.argv.slice(2)
if (!reference) {
  console.error('Usage: bun run scb:inquiry <reference1> [yyyy-MM-dd]')
  process.exit(1)
}

const config = readScbConfig()
if (!config) {
  console.error('SCB is not configured: set SCB_API_KEY, SCB_API_SECRET, SCB_BILLER_ID and SCB_REF3_PREFIX in .env')
  process.exit(1)
}

const thaiDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date)
const days = dateArgument ? [dateArgument] : [...new Set([thaiDate(new Date()), thaiDate(new Date(Date.now() - 86_400_000))])]

const short = (value: unknown) => (typeof value === 'string' && value.length > 8 ? `${value.slice(0, 4)}…(${value.length})` : value)

/** Prints a JSON body with anything that looks like a credential shortened. */
function show(body: unknown) {
  const hide = ['accessToken', 'refreshToken', 'applicationSecret', 'applicationKey']
  console.log(JSON.stringify(body, (key, value) => (hide.includes(key) ? short(value) : value), 2))
}

async function call(method: 'GET' | 'POST', path: string, token?: string, payload?: unknown) {
  const response = await fetch(config!.baseUrl + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'accept-language': 'EN',
      resourceOwnerId: config!.apiKey,
      requestUId: crypto.randomUUID(),
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })
  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // Not JSON: print it as it is.
  }
  return { status: response.status, body }
}

console.log(`Base URL: ${config.baseUrl}`)
console.log(`Biller:   ${short(config.billerId)}`)
console.log(`Reference: ${reference}\n`)

console.log('1. Access token')
const token = await call('POST', '/v1/oauth/token', undefined, {
  applicationKey: config.apiKey,
  applicationSecret: config.apiSecret,
})
console.log(`   HTTP ${token.status}`)
show(token.body)

const accessToken = (token.body as { data?: { accessToken?: string } })?.data?.accessToken
if (!accessToken) {
  console.error('\nNo access token: check SCB_API_KEY, SCB_API_SECRET and SCB_API_BASE_URL (sandbox vs production).')
  process.exit(2)
}

// The documents show GET in the heading and POST in the curl examples, so both are tried.
for (const transactionDate of days) {
  for (const method of ['GET', 'POST'] as const) {
    const query = new URLSearchParams({
      eventCode: '00300100',
      billerId: config.billerId,
      reference1: reference,
      transactionDate,
    })
    console.log(`\n2. Inquiry ${method} for ${transactionDate}`)
    const answer = await call(method, `/v1/payment/billpayment/inquiry?${query}`, accessToken)
    console.log(`   HTTP ${answer.status}`)
    show(answer.body)
  }
}
