import { inject, injectable } from 'tsyringe'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import type { QrPaymentConfirmation } from '../../../../domains/qr-payment.domain'
import { readScbConfig, type ScbConfig } from '../../../../libs/scb-config'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import type { IQrPaymentGateway, QrCode } from '../../applications/ports/qr-payment-gateway.port'

const TIMEOUT_MS = 8000
/** Thai QR Code Tag 30 (customer scans, merchant receives): the event code of the inquiry. */
const EVENT_CODE_QR30 = '00300100'
const STATUS_SUCCESS = 1000
/** SCB's answer (HTTP 404) when it knows no payment for the reference: the customer has not paid yet. */
const STATUS_NOT_FOUND = 1104
/** Renewed this long before it really expires, so a token never dies mid-request. */
const TOKEN_SAFETY_MS = 60_000

interface ScbEnvelope {
  status?: { code?: number; description?: string }
  data?: unknown
}

interface ScbResponse {
  httpStatus: number
  body: ScbEnvelope
}

const unavailable = (detail?: string, outcome?: 'unknown') =>
  new DomainExternalServiceError(
    detail ? `ติดต่อ SCB ไม่ได้: ${detail}` : 'ติดต่อ SCB ไม่ได้ กรุณาลองใหม่อีกครั้ง',
    'QR_GATEWAY_ERROR',
    outcome && { outcome },
  )

/** "50.00" for 5000 satang: SCB takes a decimal string. */
const toBaht = (satang: number) => (satang / 100).toFixed(2)
const toSatang = (baht: string) => Math.round(Number(baht) * 100)

/** yyyy-MM-dd on the Thai calendar, which is the date SCB's inquiry works with. */
const thaiDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date)

/** SCB Open API: Thai QR Code Tag 30 through the Standard Checkout flow. */
@injectable()
export class ScbQrGateway implements IQrPaymentGateway {
  private token: { value: string; expiresAt: number } | null = null
  private tokenRequest: Promise<string> | null = null

  constructor(@inject(TOKENS.Clock) private readonly clock: IClock) {}

  isEnabled() {
    return readScbConfig() !== null
  }

  async createQr({ reference, amountSatang, branchCode }: { reference: string; amountSatang: number; branchCode: string }) {
    const config = this.config()
    // A token problem happens before the request is sent, so it is a plain failure: no QR was made.
    await this.accessToken(config)

    let answer: ScbResponse
    try {
      answer = await this.call(config, 'POST', '/v1/payment/qrcode/create', {
      qrType: 'PP',
      ppType: 'BILLERID',
      ppId: config.billerId,
      amount: toBaht(amountSatang),
      ref1: reference,
      ...(config.twoReferences && { ref2: branchCode }),
      // Prefix + branch: routes SCB's callback to us and shows which branch a payment was for.
      ref3: (config.ref3Prefix + branchCode).slice(0, 20),
      })
    } catch {
      // The request left and no answer came back: the bank may or may not have made the QR.
      throw unavailable(undefined, 'unknown')
    }

    const { httpStatus, body } = answer
    // A server error says nothing about whether the QR exists either.
    if (httpStatus >= 500) throw unavailable(body.status?.description, 'unknown')
    const data = body.data as Partial<QrCode> | undefined
    if (httpStatus !== 200 || body.status?.code !== STATUS_SUCCESS || !data?.qrRawData)
      throw unavailable(body.status?.description)
    return { qrRawData: data.qrRawData, qrImage: data.qrImage ?? '' }
  }

  async findPayment({ reference, amountSatang, since }: { reference: string; amountSatang: number; since: Date }) {
    const config = this.config()
    // The QR may have been made before midnight and paid after it: look on both days.
    const days = [...new Set([thaiDate(since), thaiDate(this.clock.now())])]

    for (const transactionDate of days) {
      const query = new URLSearchParams({
        eventCode: EVENT_CODE_QR30,
        billerId: config.billerId,
        reference1: reference,
        transactionDate,
      })
      const { httpStatus, body } = await this.call(config, 'GET', `/v1/payment/billpayment/inquiry?${query}`)

      // "Not found" is an answer, not a failure: the inquiry only returns payments that went through.
      if (body.status?.code === STATUS_NOT_FOUND) continue
      // Anything else that is not a clean success (wrong biller, bad request, outage) is a failure to
      // report, not a payment that has not happened: treating it as "not paid" would hide a bad setup.
      if (httpStatus !== 200 || body.status?.code !== STATUS_SUCCESS || !Array.isArray(body.data))
        throw unavailable(body.status?.description)

      const match = (body.data as Record<string, string | undefined>[]).find(
        (item) =>
          item.billPaymentRef1 === reference &&
          item.reverseFlag !== 'R' && // R marks a refunded transaction
          item.amount !== undefined &&
          toSatang(item.amount) === amountSatang &&
          item.transactionId,
      )
      if (match)
        return {
          transactionId: match.transactionId!,
          amountSatang,
          paidAt: match.transactionDateandTime ? new Date(match.transactionDateandTime) : this.clock.now(),
          payerName: match.payerName ?? null,
        } satisfies QrPaymentConfirmation
    }
    return null
  }

  private config(): ScbConfig {
    const config = readScbConfig()
    if (!config) throw new DomainExternalServiceError('ยังไม่ได้ตั้งค่า SCB', 'QR_NOT_CONFIGURED')
    return config
  }

  /** One call to SCB. A rejected token is replaced and the call repeated once. */
  private async call(config: ScbConfig, method: 'GET' | 'POST', path: string, payload?: unknown, retried = false): Promise<ScbResponse> {
    const token = await this.accessToken(config)
    const response = await this.send(config, method, path, payload, token)

    if (response.httpStatus === 401 && !retried) {
      this.token = null
      return this.call(config, method, path, payload, true)
    }
    return response
  }

  private async accessToken(config: ScbConfig): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_SAFETY_MS > this.clock.now().getTime()) return this.token.value

    // One request at a time: concurrent first calls share the same token fetch.
    this.tokenRequest ??= this.fetchToken(config).finally(() => {
      this.tokenRequest = null
    })
    return this.tokenRequest
  }

  private async fetchToken(config: ScbConfig): Promise<string> {
    const { httpStatus, body } = await this.send(config, 'POST', '/v1/oauth/token', {
      applicationKey: config.apiKey,
      applicationSecret: config.apiSecret,
    })
    const data = body.data as { accessToken?: string; expiresIn?: number } | undefined
    if (httpStatus !== 200 || body.status?.code !== STATUS_SUCCESS || !data?.accessToken) throw unavailable()

    this.token = {
      value: data.accessToken,
      expiresAt: this.clock.now().getTime() + (data.expiresIn ?? 1800) * 1000,
    }
    return data.accessToken
  }

  private async send(
    config: ScbConfig,
    method: 'GET' | 'POST',
    path: string,
    payload?: unknown,
    token?: string,
  ): Promise<ScbResponse> {
    try {
      const response = await fetch(config.baseUrl + path, {
        method,
        headers: {
          'content-type': 'application/json',
          'accept-language': 'EN',
          resourceOwnerId: config.apiKey,
          requestUId: crypto.randomUUID(),
          ...(token && { authorization: `Bearer ${token}` }),
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const body = (await response.json().catch(() => ({}))) as ScbEnvelope
      return { httpStatus: response.status, body }
    } catch {
      // Network failure or timeout. The message never carries the request, which holds the secret.
      throw unavailable()
    }
  }
}
