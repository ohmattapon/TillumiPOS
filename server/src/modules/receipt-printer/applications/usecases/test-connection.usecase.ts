import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'
import { printerGatewayToken, type IPrinterGateway } from '../ports/printer-gateway.port'
import { printerSettingsToken, type IPrinterSettings } from '../ports/printer-settings.port'

const PING_TIMEOUT_MS = 5000

/**
 * Command: proves the configured printer listens, without sending anything.
 * A connection is a side effect on the printer, so this is a command even though it writes nothing.
 * It never audits: a test is not shop history.
 */
@injectable()
export class TestPrinterConnectionUseCase {
  constructor(
    @inject(printerSettingsToken) private readonly printer: IPrinterSettings,
    @inject(printerGatewayToken) private readonly gateway: IPrinterGateway,
  ) {}

  async execute(): Promise<{ ok: true }> {
    const settings = await this.printer.current()
    if (!settings.enabled)
      throw new DomainConflictError('ปิดพิมพ์ผ่านแลนอยู่ เปิดในตั้งค่าร้านก่อนทดสอบ', 'PRINTER_DISABLED')
    if (settings.host === null)
      throw new DomainError('ยังไม่ได้กรอก IP เครื่องพิมพ์ในตั้งค่าร้าน', 'INVALID_PRINTER_SETTINGS')

    await this.gateway.ping({ host: settings.host, port: settings.port, timeoutMs: PING_TIMEOUT_MS })
    return { ok: true as const }
  }
}
