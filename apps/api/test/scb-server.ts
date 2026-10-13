/** A payment the fake bank has received. */
interface FakePayment {
  transactionId: string
  reference: string
  amount: string
  paidAt: Date
  payerName: string
  reverseFlag: string
}

interface RecordedRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
}

export interface FakeScb {
  /** Everything before `/v1/...`, to put in SCB_API_BASE_URL. */
  url: string
  /** What the shop's `.env` would hold for it. */
  credentials: { apiKey: string; apiSecret: string; billerId: string; ref3Prefix: string }
  requests: RecordedRequest[]
  /** QRs created through it, by reference 1. */
  created: Map<string, { amount: string; ref3: string; ref2?: string; ppId: string }>
  tokensIssued: number
  /** A customer paying: the bank now knows the payment, as it does after a real scan. */
  pay(reference: string, options?: { amountSatang?: number; payerName?: string; reverseFlag?: string; at?: Date }): void
  /** Makes every access token already handed out invalid, as when they expire. */
  revokeTokens(): void
  /** While set, every request answers with this HTTP status. */
  setFailing(status: number | null): void
  /** Applies an environment that points the API at this fake. */
  enableIn(env: Record<string, string | undefined>): void
  reset(): void
}

const thaiDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date)
const envelope = (code: number, description: string, data?: unknown) => ({ status: { code, description }, data })

function start(): FakeScb {
  const credentials = {
    apiKey: 'test-api-key-0000000000000000000',
    apiSecret: 'test-api-secret-00000000000000',
    billerId: '123456789012345',
    ref3Prefix: 'TST',
  }
  const requests: RecordedRequest[] = []
  const created = new Map<string, { amount: string; ref3: string; ref2?: string; ppId: string }>()
  const payments = new Map<string, FakePayment>()
  let validTokens = new Set<string>()
  let failing: number | null = null
  let tokensIssued = 0
  let transactionCounter = 0

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const headers = Object.fromEntries(request.headers)
      const body = request.method === 'POST' ? await request.json().catch(() => null) : null
      requests.push({ method: request.method, path: url.pathname + url.search, headers, body })

      if (failing !== null) return Response.json(envelope(5000, 'down'), { status: failing })
      if (headers.resourceownerid !== credentials.apiKey)
        return Response.json(envelope(1100, 'resourceOwnerId'), { status: 400 })
      if (!headers.requestuid) return Response.json(envelope(1100, 'requestUId'), { status: 400 })

      if (url.pathname === '/v1/oauth/token' && request.method === 'POST') {
        const sent = body as { applicationKey?: string; applicationSecret?: string } | null
        if (sent?.applicationKey !== credentials.apiKey || sent?.applicationSecret !== credentials.apiSecret)
          return Response.json(envelope(9300, 'Invalid credentials'), { status: 401 })
        const accessToken = `token-${++tokensIssued}`
        validTokens.add(accessToken)
        return Response.json(envelope(1000, 'Success', { accessToken, tokenType: 'Bearer', expiresIn: 1800 }))
      }

      const token = headers.authorization?.replace(/^Bearer /, '')
      if (!token || !validTokens.has(token)) return Response.json(envelope(9300, 'Invalid token'), { status: 401 })

      if (url.pathname === '/v1/payment/qrcode/create' && request.method === 'POST') {
        const sent = body as Record<string, string> | null
        const problems: string[] = []
        if (sent?.qrType !== 'PP') problems.push('qrType')
        if (sent?.ppType !== 'BILLERID') problems.push('ppType')
        if (sent?.ppId !== credentials.billerId) problems.push('ppId')
        if (!/^\d+\.\d{2}$/.test(sent?.amount ?? '')) problems.push('amount')
        if (!/^[A-Z0-9]{1,20}$/.test(sent?.ref1 ?? '')) problems.push('ref1')
        if (!/^[A-Z0-9]{1,20}$/.test(sent?.ref3 ?? '') || !sent?.ref3?.startsWith(credentials.ref3Prefix))
          problems.push('ref3')
        if (problems.length) return Response.json(envelope(1002, `Invalid ${problems.join(', ')}`), { status: 400 })

        created.set(sent!.ref1!, { amount: sent!.amount!, ref3: sent!.ref3!, ref2: sent!.ref2, ppId: sent!.ppId! })
        return Response.json(
          envelope(1000, 'Success', { qrRawData: `00020101021230TEST${sent!.ref1}`, qrImage: 'iVBORw0KGgo=' }),
        )
      }

      if (url.pathname === '/v1/payment/billpayment/inquiry' && request.method === 'GET') {
        const query = url.searchParams
        const payment = payments.get(query.get('reference1') ?? '')
        if (query.get('eventCode') !== '00300100' || query.get('billerId') !== credentials.billerId)
          return Response.json(envelope(1002, 'Invalid parameter'), { status: 400 })
        // What the real sandbox answers when no payment is known for the reference.
        if (!payment || query.get('transactionDate') !== thaiDate(payment.paidAt))
          return Response.json(envelope(1104, 'Requested entity record does not exist'), { status: 404 })

        return Response.json(
          envelope(1000, 'Success', [
            {
              eventCode: '00300100',
              transactionType: 'Domestic Transfers',
              reverseFlag: payment.reverseFlag,
              payeeProxyType: 'BILLERID',
              payeeProxyId: credentials.billerId,
              payerName: payment.payerName,
              sendingBankCode: '014',
              receivingBankCode: '014',
              amount: payment.amount,
              transactionId: payment.transactionId,
              transactionDateandTime: payment.paidAt.toISOString(),
              billPaymentRef1: payment.reference,
              billPaymentRef3: created.get(payment.reference)?.ref3 ?? '',
              currencyCode: '764',
              channelCode: 'PMH',
            },
          ]),
        )
      }

      return Response.json(envelope(1100, 'Not found'), { status: 404 })
    },
  })

  return {
    url: `http://localhost:${server.port}`,
    credentials,
    requests,
    created,
    get tokensIssued() {
      return tokensIssued
    },
    pay(reference, { amountSatang, payerName = 'ลูกค้าทดสอบ', reverseFlag = '', at = new Date() } = {}) {
      const qr = created.get(reference)
      const amount = amountSatang !== undefined ? (amountSatang / 100).toFixed(2) : qr?.amount
      if (!amount) throw new Error(`The fake bank never created a QR for ${reference}`)
      payments.set(reference, {
        transactionId: `FAKE-TX-${++transactionCounter}`,
        reference,
        amount,
        paidAt: at,
        payerName,
        reverseFlag,
      })
    },
    revokeTokens() {
      validTokens = new Set()
    },
    setFailing(status) {
      failing = status
    },
    enableIn(env) {
      env.SCB_API_KEY = credentials.apiKey
      env.SCB_API_SECRET = credentials.apiSecret
      env.SCB_BILLER_ID = credentials.billerId
      env.SCB_REF3_PREFIX = credentials.ref3Prefix
      env.SCB_API_BASE_URL = `http://localhost:${server.port}`
    },
    reset() {
      requests.length = 0
      created.clear()
      payments.clear()
      validTokens = new Set()
      failing = null
      tokensIssued = 0
      transactionCounter = 0
    },
  }
}

// Shared across every test file in the run, like the fake media server.
const shared = globalThis as typeof globalThis & { __posFakeScb?: FakeScb }

export const fakeScb: FakeScb = (shared.__posFakeScb ??= start())

/** Keys that switch QR payment on; tests that turn it on must turn it off again. */
export const SCB_ENV_KEYS = ['SCB_API_KEY', 'SCB_API_SECRET', 'SCB_BILLER_ID', 'SCB_REF3_PREFIX', 'SCB_API_BASE_URL', 'SCB_TWO_REFERENCES'] as const
