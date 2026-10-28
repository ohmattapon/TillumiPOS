import http from 'node:http'
import https from 'node:https'
import { readFileSync } from 'node:fs'
import QRCode from 'qrcode'
import { inject, injectable } from 'tsyringe'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import type { QrPaymentConfirmation } from '../../../../domains/qr-payment.domain'
import { readKbankConfig, type KbankConfig } from '../../../../libs/kbank-config'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import type { IQrPaymentGateway } from '../../applications/ports/qr-payment-gateway.port'

const TIMEOUT_MS = 8000
/** Thai QR (PromptPay): the qrType of the create-QR request. */
const QR_TYPE_THAI_QR = 3
/** Success marker of KBank's envelope, seen on the create-QR example. */
const STATUS_SUCCESS = '00'
/**
 * Sandbox exercise ids: each operation answers only to its own. Sent only when
 * test mode is on; production ignores these headers.
 */
const SANDBOX_TOKEN_ID = 'OAUTH2'
const SANDBOX_CREATE_ID = 'QR002'
const SANDBOX_INQUIRY_ID = 'QR004'
/** Renewed this long before it really expires, so a token never dies mid-request. */
const TOKEN_SAFETY_MS = 60_000

// --- INQUIRY RESPONSE ----------------------------------------------------------
// Shapes confirmed against the sandbox: every answer carries `statusCode`, `txnStatus`
// (REQUESTED | PAID | CANCELLED | VOIDED), `txnAmount` ("120.00") and `txnNo` (always null),
// with no payment timestamp. Only PAID means money arrived.

interface KbankEnvelope {
  statusCode?: string
  errorCode?: string
  errorDesc?: string
  [key: string]: unknown
}

interface KbankResponse {
  httpStatus: number
  body: KbankEnvelope
}

const unavailable = (detail?: string, outcome?: 'unknown') =>
  new DomainExternalServiceError(
    detail ? `ติดต่อ KBank ไม่ได้: ${detail}` : 'ติดต่อ KBank ไม่ได้ กรุณาลองใหม่อีกครั้ง',
    'QR_GATEWAY_ERROR',
    outcome && { outcome },
  )

/** "50.00" for 5000 satang: KBank takes a decimal string. */
const toBaht = (satang: number) => (satang / 100).toFixed(2)
const toSatang = (baht: string | number) => Math.round(Number(baht) * 100)

/** ISO-8601 in Bangkok time (`+07:00` all year, no daylight saving), which requestDt uses. */
const bangkokIso = (date: Date) => new Date(date.getTime() + 7 * 3600_000).toISOString().slice(0, 19) + '+07:00'

/** KBank Open API: Thai QR through `/v1/qrpayment/request`, status through `/v1/qrpayment/v4/inquiry`. */
@injectable()
export class KbankQrGateway implements IQrPaymentGateway {
  private token: { value: string; expiresAt: number } | null = null
  private tokenRequest: Promise<string> | null = null

  constructor(@inject(TOKENS.Clock) private readonly clock: IClock) {}

  isEnabled() {
    return readKbankConfig() !== null
  }

  async createQr({ reference, amountSatang, branchCode }: { reference: string; amountSatang: number; branchCode: string }) {
    const config = this.config()
    // A token problem happens before the request is sent, so it is a plain failure: no QR was made.
    await this.accessToken(config)

    let answer: KbankResponse
    try {
      answer = await this.call(config, '/v1/qrpayment/request', SANDBOX_CREATE_ID, {
        qrType: QR_TYPE_THAI_QR,
        txnCurrencyCode: 'THB',
        merchantId: config.merchantId,
        partnerTxnUid: reference,
        partnerId: config.partnerId,
        partnerSecret: config.partnerSecret,
        requestDt: bangkokIso(this.clock.now()),
        txnAmount: toBaht(amountSatang),
        // The branch the QR was made for, for reconciliation on bank statements.
        reference1: branchCode,
      })
    } catch {
      // The request left and no answer came back: the bank may or may not have made the QR.
      throw unavailable(undefined, 'unknown')
    }

    const { httpStatus, body } = answer
    // A server error says nothing about whether the QR exists either.
    if (httpStatus >= 500) throw unavailable(typeof body.errorDesc === 'string' ? body.errorDesc : undefined, 'unknown')
    if (httpStatus !== 200 || body.statusCode !== STATUS_SUCCESS || typeof body.qrCode !== 'string' || !body.qrCode)
      throw unavailable(typeof body.errorDesc === 'string' ? body.errorDesc : undefined)
    // KBank answers the EMV payload only, so the adapter renders the picture the till
    // shows from it; SCB's bank sent one ready-made.
    return { qrRawData: body.qrCode, qrImage: await QRCode.toDataURL(body.qrCode) }
  }

  async findPayment({ reference, amountSatang }: { reference: string; amountSatang: number; since: Date }) {
    const config = this.config()
    const { httpStatus, body } = await this.call(config, '/v1/qrpayment/v4/inquiry', SANDBOX_INQUIRY_ID, {
      partnerId: config.partnerId,
      partnerSecret: config.partnerSecret,
      merchantId: config.merchantId,
      partnerTxnUid: reference,
      // The exercise shows a distinct id per call pointing back at the original QR; until the first
      // real sandbox answer shows what the bank echoes, the reference itself is sent.
      origPartnerTxnUid: reference,
      requestDt: bangkokIso(this.clock.now()),
    })

    // "Not found" is an answer, not a failure: the inquiry only returns payments that went through.
    if (httpStatus === 404) return null
    // Anything else that is not a clean success (wrong merchant, bad request, outage) is a failure
    // to report, not a payment that has not happened: treating it as "not paid" would hide a bad setup.
    if (httpStatus !== 200 || body.statusCode !== STATUS_SUCCESS) throw unavailable(typeof body.errorDesc === 'string' ? body.errorDesc : undefined)

    if (body.partnerTxnUid !== reference && body.origPartnerTxnUid !== reference) return null
    // REQUESTED (still waiting), CANCELLED and VOIDED (money returned) mean nothing to record.
    if (String(body.txnStatus ?? '').toUpperCase() !== 'PAID') return null
    const paidAmount = body.txnAmount
    if ((typeof paidAmount !== 'string' && typeof paidAmount !== 'number') || toSatang(paidAmount) !== amountSatang)
      return null
    // The bank sends no transaction number and no payment time, so the inquiry's own reference
    // identifies the money and the inquiry time stands in for when it arrived.
    const transactionId = body.txnNo ?? body.partnerTxnUid
    return {
      transactionId: typeof transactionId === 'string' && transactionId ? transactionId : reference,
      amountSatang,
      paidAt: this.clock.now(),
      payerName: typeof body.payerName === 'string' ? body.payerName : null,
    } satisfies QrPaymentConfirmation
  }

  private config(): KbankConfig {
    const config = readKbankConfig()
    if (!config) throw new DomainExternalServiceError('ยังไม่ได้ตั้งค่า KBank', 'QR_NOT_CONFIGURED')
    return config
  }

  /** One call to KBank. A rejected token is replaced and the call repeated once. */
  private async call(config: KbankConfig, path: string, envId: string, payload: unknown, retried = false): Promise<KbankResponse> {
    const token = await this.accessToken(config)
    const response = await this.send(config, path, payload, token, 'application/json', envId)

    if (response.httpStatus === 401 && !retried) {
      this.token = null
      return this.call(config, path, envId, payload, true)
    }
    return response
  }

  private async accessToken(config: KbankConfig): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_SAFETY_MS > this.clock.now().getTime()) return this.token.value

    // One request at a time: concurrent first calls share the same token fetch.
    this.tokenRequest ??= this.fetchToken(config).finally(() => {
      this.tokenRequest = null
    })
    return this.tokenRequest
  }

  private async fetchToken(config: KbankConfig): Promise<string> {
    const { httpStatus, body } = await this.send(
      config,
      '/v2/oauth/token',
      new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      `Basic ${Buffer.from(`${config.consumerId}:${config.consumerSecret}`).toString('base64')}`,
      'application/x-www-form-urlencoded',
      SANDBOX_TOKEN_ID,
    )
    const data = body as { accessToken?: string; access_token?: string; expiresIn?: number; expires_in?: number }
    const accessToken = data?.accessToken ?? data?.access_token
    if (httpStatus !== 200 || !accessToken) throw unavailable()

    this.token = {
      value: accessToken,
      expiresAt: this.clock.now().getTime() + (data.expiresIn ?? data.expires_in ?? 1800) * 1000,
    }
    return accessToken
  }

  /**
   * One POST to KBank. node:http(s) rather than fetch because the client certificate of mTLS
   * cannot ride on fetch; without configured files it is a plain request, which is what the
   * fake bank speaks in tests. The message never carries the request, which holds the secret.
   */
  private send(config: KbankConfig, path: string, payload: string | unknown, token: string, contentType = 'application/json', envId?: string): Promise<KbankResponse> {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    return new Promise((resolve, reject) => {
      const url = config.baseUrl + path
      const lib = url.startsWith('https:') ? https : http
      const request = lib.request(
        url,
        {
          method: 'POST',
          headers: {
            'content-type': contentType,
            authorization: token.startsWith('Basic ') ? token : `Bearer ${token}`,
            ...(config.testMode && { 'x-test-mode': 'true' }),
            ...(config.testMode && envId && { 'env-id': envId }),
          },
          ...(config.certPath && { cert: readFileSync(config.certPath) }),
          ...(config.keyPath && { key: readFileSync(config.keyPath) }),
        },
        (response) => {
          let text = ''
          response.on('data', (chunk) => (text += chunk))
          response.on('end', () => {
            let parsed: KbankEnvelope = {}
            try {
              parsed = JSON.parse(text) as KbankEnvelope
            } catch {
              // A non-JSON answer carries no usable detail; the status still stands.
            }
            resolve({ httpStatus: response.statusCode ?? 0, body: parsed })
          })
        },
      )
      request.on('error', () => reject(unavailable()))
      request.setTimeout(TIMEOUT_MS, () => request.destroy(unavailable()))
      request.write(body)
      request.end()
    })
  }
}
