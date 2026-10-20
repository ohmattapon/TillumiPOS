import { Socket } from 'node:net'
import { injectable } from 'tsyringe'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import type { IPrinterGateway, PrintDispatch } from '../../applications/ports/printer-gateway.port'

const unreachable = () =>
  new DomainExternalServiceError('เชื่อมต่อเครื่องพิมพ์ไม่ได้ ตรวจว่าเครื่องเปิดอยู่และต่อแลนเดียวกับเครื่องขาย', 'PRINTER_UNREACHABLE')

/**
 * The printer stayed connected past the timeout. With the raw port there is no reply to wait for,
 * so bytes written before the stall may already be on paper: the outcome is unknown, never a success.
 */
const timedOut = (outcome: 'unknown' | null) =>
  new DomainExternalServiceError(
    'เครื่องพิมพ์ตอบช้าเกินไป ดูที่เครื่องว่าออกมาแล้วหรือไม่ก่อนสั่งพิมพ์ซ้ำ',
    'PRINTER_TIMEOUT',
    outcome ? { outcome } : undefined,
  )

/** A refused or unroutable connection sent nothing; anything stranger after connecting is unknown. */
const mapError = (connected: boolean) => (connected ? timedOut('unknown') : unreachable())

interface SendRequest {
  host: string
  port: number
  bytes: Uint8Array
  timeoutMs: number
}

/** Raw TCP to the printer's port 9100: connect, flush, half-close, and always destroy the socket. */
@injectable()
export class TcpPrinterGateway implements IPrinterGateway {
  sendRaw({ host, port, bytes, timeoutMs }: SendRequest): Promise<PrintDispatch> {
    return new Promise((resolve, reject) => {
      const socket = new Socket()
      let settled = false
      let connected = false
      const done = (finish: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.destroy()
        finish()
      }
      // Our own timer, not just the socket's: socket-level timeouts are unreliable on some
      // platforms (a stalled flush never trips them), and an unanswered send must always resolve.
      const timer = setTimeout(() => done(() => reject(connected ? timedOut('unknown') : timedOut(null))), timeoutMs)

      socket.setTimeout(timeoutMs)
      // A stall before connecting sent nothing; a stall after may have printed already.
      socket.on('timeout', () => done(() => reject(connected ? timedOut('unknown') : timedOut(null))))
      socket.on('error', () => done(() => reject(mapError(connected))))
      // The far end closing a healthy connection after our FIN is the success signal.
      socket.on('close', (hadError) => done(() => (hadError ? reject(mapError(connected)) : resolve({ sentBytes: bytes.length }))))

      socket.connect(port, host, () => {
        connected = true
        socket.write(bytes, (error) => {
          if (error) done(() => reject(mapError(true)))
          else socket.end()
        })
      })
    })
  }

  ping({ host, port, timeoutMs }: Omit<SendRequest, 'bytes'>): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new Socket()
      let settled = false
      const done = (finish: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.destroy()
        finish()
      }
      // Own timer for the same reason as sendRaw: never hang past timeoutMs on any platform.
      const timer = setTimeout(() => done(() => reject(timedOut(null))), timeoutMs)

      socket.setTimeout(timeoutMs)
      socket.on('timeout', () => done(() => reject(timedOut(null))))
      socket.on('error', () => done(() => reject(unreachable())))
      socket.on('close', (hadError) => done(() => (hadError ? reject(unreachable()) : resolve())))

      // No bytes: the open alone proves the printer listens.
      socket.connect(port, host, () => socket.end())
    })
  }
}
