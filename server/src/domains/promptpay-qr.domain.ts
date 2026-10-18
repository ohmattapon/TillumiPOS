import { DomainError } from './errors/domain-error'
import { MAX_AMOUNT_SATANG } from './sale.domain'

const PROMPTPAY_AID = 'A000000677010111'

const invalidTarget = () => new DomainError('เลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลักขึ้นต้นด้วย 0 หรือเลขบัตร 13 หลัก', 'INVALID_SHOP_SETTINGS')
const invalidAmount = () =>
  new DomainError('ยอดพร้อมเพย์ต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1 ขึ้นไป', 'INVALID_PAYMENT')

const tlv = (tag: string, value: string): string => `${tag}${String(value.length).padStart(2, '0')}${value}`

const crc16Ccitt = (input: string): string => {
  let crc = 0xffff
  for (let index = 0; index < input.length; index += 1) {
    crc ^= input.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Builds an EMVCo/PromptPay QR payload string with the bill amount embedded.
 * Pure: no I/O, no framework imports. Shared with the web via `@pos/api/promptpay-qr`.
 *
 * Field `01` is always `12`: the reference `promptpay-qr` library emits `11`
 * for amount-less (static) codes and `12` once an amount is embedded, and this
 * function always embeds the amount. Field order (58 before 53) also follows
 * that library so payloads byte-match its output.
 */
export function buildPromptPayPayload(target: string, amountSatang: number): string {
  let account: string
  if (/^0\d{9}$/.test(target)) account = tlv('01', `0066${target.slice(1)}`)
  else if (/^\d{13}$/.test(target)) account = tlv('02', target)
  else throw invalidTarget()

  if (!Number.isInteger(amountSatang) || amountSatang < 1) throw invalidAmount()
  if (amountSatang > MAX_AMOUNT_SATANG)
    throw new DomainError('ยอดเงินเกินกว่าที่ระบบรองรับ', 'AMOUNT_TOO_LARGE')

  const body =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('29', tlv('00', PROMPTPAY_AID) + account) +
    tlv('58', 'TH') +
    tlv('53', '764') +
    tlv('54', (amountSatang / 100).toFixed(2)) +
    '6304'
  return body + crc16Ccitt(body)
}
