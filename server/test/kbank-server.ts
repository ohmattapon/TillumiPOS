/** What the fake bank knows about a QR: a payment once it has one. */
interface FakePayment {
  amount: string
  payerName: string
  status: 'PAID' | 'CANCELLED' | 'VOIDED'
}

interface RecordedRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
}

export interface FakeKbank {
  /** Everything before `/v1/...` and `/v2/...`, to put in KBANK_API_BASE_URL. */
  url: string
  /** What the shop's `.env` would hold for it. */
  credentials: { consumerId: string; consumerSecret: string; merchantId: string; partnerId: string; partnerSecret: string }
  requests: RecordedRequest[]
  /** QRs created through it, by partner transaction id. */
  created: Map<string, { amount: string; reference1: string }>
  tokensIssued: number
  /** A customer paying: the bank now knows the payment, as it does after a real scan. */
  pay(reference: string, options?: { amountSatang?: number; payerName?: string }): void
  /** The shop cancelling an unpaid QR, or voiding a paid one to return the money. */
  cancel(reference: string): void
  void(reference: string): void
  /** Makes every access token already handed out invalid, as when they expire. */
  revokeTokens(): void
  /** While set, every request answers with this HTTP status. */
  setFailing(status: number | null): void
  /**
   * The next QR creation reaches the bank but its answer is lost on the way back (a gateway timeout).
   * `made` says whether the bank really made the QR before the answer was lost.
   */
  loseNextCreateAnswer(made: boolean): void
  /** Applies an environment that points the API at this fake. */
  enableIn(env: Record<string, string | undefined>): void
  reset(): void
}

function start(): FakeKbank {
  const credentials = {
    consumerId: 'test-consumer-id',
    consumerSecret: 'test-consumer-secret',
    merchantId: 'KB102057149704',
    partnerId: 'PTR1051673',
    partnerSecret: 'test-partner-secret',
  }
  const requests: RecordedRequest[] = []
  const created = new Map<string, { amount: string; reference1: string }>()
  const payments = new Map<string, FakePayment>()
  const validTokens = new Set<string>()
  let failing: number | null = null
  let lostAnswer: { made: boolean } | null = null
  let tokensIssued = 0

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const headers = Object.fromEntries(request.headers)
      const body = request.method === 'POST' ? await request.json().catch(() => null) : null
      requests.push({ method: request.method, path: url.pathname + url.search, headers, body })

      if (failing !== null) return Response.json({ statusCode: '500', errorCode: '500', errorDesc: 'down' }, { status: failing })

      if (url.pathname === '/v2/oauth/token' && request.method === 'POST') {
        const expected = `Basic ${Buffer.from(`${credentials.consumerId}:${credentials.consumerSecret}`).toString('base64')}`
        if (headers.authorization !== expected)
          return Response.json({ error: 'invalid_client' }, { status: 401 })
        const accessToken = `token-${++tokensIssued}`
        validTokens.add(accessToken)
        return Response.json({ accessToken, tokenType: 'Bearer', expiresIn: 1800 })
      }

      const token = headers.authorization?.replace(/^Bearer /, '')
      if (!token || !validTokens.has(token)) return Response.json({ error: 'invalid_token' }, { status: 401 })

      if (url.pathname === '/v1/qrpayment/request' && request.method === 'POST') {
        const sent = body as Record<string, string | number> | null
        const problems: string[] = []
        if (sent?.qrType !== 3) problems.push('qrType')
        if (sent?.txnCurrencyCode !== 'THB') problems.push('txnCurrencyCode')
        if (sent?.merchantId !== credentials.merchantId) problems.push('merchantId')
        if (sent?.partnerId !== credentials.partnerId) problems.push('partnerId')
        if (sent?.partnerSecret !== credentials.partnerSecret) problems.push('partnerSecret')
        if (!/^[A-Z0-9]{1,15}$/.test(String(sent?.partnerTxnUid ?? ''))) problems.push('partnerTxnUid')
        if (!/^\d+\.\d{2}$/.test(String(sent?.txnAmount ?? ''))) problems.push('txnAmount')
        if (!sent?.requestDt) problems.push('requestDt')
        if (problems.length)
          return Response.json({ statusCode: '01', errorCode: '01', errorDesc: `Invalid ${problems.join(', ')}` }, { status: 400 })

        const uid = String(sent!.partnerTxnUid)
        if (lostAnswer) {
          const { made } = lostAnswer
          lostAnswer = null
          if (made) created.set(uid, { amount: String(sent!.txnAmount), reference1: String(sent!.reference1 ?? 'null') })
          return Response.json({ statusCode: '04', errorCode: '04', errorDesc: 'Gateway timeout' }, { status: 504 })
        }

        created.set(uid, { amount: String(sent!.txnAmount), reference1: String(sent!.reference1 ?? 'null') })
        return Response.json({
          partnerTxnUid: uid,
          partnerId: credentials.partnerId,
          statusCode: '00',
          errorCode: '00',
          errorDesc: 'Success',
          accountName: 'ร้านทดสอบ',
          qrCode: `00020101021230TEST${uid}`,
          sof: ['PP'],
        })
      }

      if (url.pathname === '/v1/qrpayment/v4/inquiry' && request.method === 'POST') {
        const sent = body as Record<string, string> | null
        if (sent?.partnerId !== credentials.partnerId || sent?.partnerSecret !== credentials.partnerSecret || sent?.merchantId !== credentials.merchantId)
          return Response.json({ statusCode: '01', errorCode: '01', errorDesc: 'Invalid parameter' }, { status: 400 })
        // A uid the bank never made is not found. A QR it made but nobody paid is REQUESTED,
        // mirroring the real answers: only a payment moves the status.
        const uid = sent?.partnerTxnUid ?? ''
        const qr = created.get(uid)
        if (!qr)
          return Response.json({ statusCode: '404', errorCode: '404', errorDesc: 'Transaction not found' }, { status: 404 })
        const payment = payments.get(uid)

        return Response.json({
          partnerTxnUid: uid,
          partnerId: credentials.partnerId,
          statusCode: '00',
          errorCode: null,
          errorDesc: null,
          txnStatus: payment?.status ?? 'REQUESTED',
          txnNo: null,
          loyaltyId: null,
          ...((payment?.status === 'PAID' || payment?.status === 'VOIDED') && { channel: 'kplus' }),
          merchantId: credentials.merchantId,
          terminalId: '09000107',
          qrType: '3',
          txnAmount: payment?.amount ?? qr.amount,
          txnCurrencyCode: 'THB',
          reference1: qr.reference1,
          reference2: 'null',
          reference3: 'null',
          reference4: 'null',
        })
      }

      return Response.json({ statusCode: '404', errorCode: '404', errorDesc: 'Not found' }, { status: 404 })
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
    pay(reference, { amountSatang, payerName = 'ลูกค้าทดสอบ' } = {}) {
      const qr = created.get(reference)
      const amount = amountSatang !== undefined ? (amountSatang / 100).toFixed(2) : qr?.amount
      if (!amount) throw new Error(`The fake bank never created a QR for ${reference}`)
      payments.set(reference, { amount, payerName, status: 'PAID' })
    },
    cancel(reference) {
      if (!created.has(reference)) throw new Error(`The fake bank never created a QR for ${reference}`)
      const prior = payments.get(reference)
      payments.set(reference, { amount: prior?.amount ?? created.get(reference)!.amount, payerName: prior?.payerName ?? 'ลูกค้าทดสอบ', status: 'CANCELLED' })
    },
    void(reference) {
      if (!created.has(reference)) throw new Error(`The fake bank never created a QR for ${reference}`)
      const prior = payments.get(reference)
      payments.set(reference, { amount: prior?.amount ?? created.get(reference)!.amount, payerName: prior?.payerName ?? 'ลูกค้าทดสอบ', status: 'VOIDED' })
    },
    revokeTokens() {
      validTokens.clear()
    },
    loseNextCreateAnswer(made) {
      lostAnswer = { made }
    },
    setFailing(status) {
      failing = status
    },
    enableIn(env) {
      env.KBANK_CONSUMER_ID = credentials.consumerId
      env.KBANK_CONSUMER_SECRET = credentials.consumerSecret
      env.KBANK_MERCHANT_ID = credentials.merchantId
      env.KBANK_PARTNER_ID = credentials.partnerId
      env.KBANK_PARTNER_SECRET = credentials.partnerSecret
      env.KBANK_API_BASE_URL = `http://localhost:${server.port}`
    },
    reset() {
      requests.length = 0
      created.clear()
      payments.clear()
      validTokens.clear()
      failing = null
      lostAnswer = null
      tokensIssued = 0
    },
  }
}

// Shared across every test file in the run, like the fake SCB and media servers.
const shared = globalThis as typeof globalThis & { __posFakeKbank?: FakeKbank }

export const fakeKbank: FakeKbank = (shared.__posFakeKbank ??= start())

/** Keys that switch KBank QR payment on; tests that turn it on must turn it off again. */
export const KBANK_ENV_KEYS = ['KBANK_CONSUMER_ID', 'KBANK_CONSUMER_SECRET', 'KBANK_MERCHANT_ID', 'KBANK_PARTNER_ID', 'KBANK_PARTNER_SECRET', 'KBANK_API_BASE_URL', 'KBANK_CERT_PATH', 'KBANK_KEY_PATH', 'KBANK_TEST_MODE', 'KBANK_ENV_ID'] as const
