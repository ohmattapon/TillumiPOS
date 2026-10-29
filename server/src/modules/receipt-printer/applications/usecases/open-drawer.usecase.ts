import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'
import { buildDrawerCommand } from '../../../../domains/receipt-raster.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { printAuditToken, type IPrintAudit } from '../ports/print-audit.port'
import { printerGatewayToken, type IPrinterGateway } from '../ports/printer-gateway.port'
import { printerSettingsToken, type IPrinterSettings } from '../ports/printer-settings.port'

const SEND_TIMEOUT_MS = 5000

/**
 * Command: kicks the cash drawer through the printer without printing.
 * A retry that kicks twice only opens an open drawer: no idempotency record, but every kick is audited.
 * The drawer's auto-kick flag is for after-print kicks only; a hand-opened drawer needs the printer on.
 */
@injectable()
export class OpenDrawerUseCase {
  constructor(
    @inject(printerSettingsToken) private readonly printer: IPrinterSettings,
    @inject(printerGatewayToken) private readonly gateway: IPrinterGateway,
    @inject(printAuditToken) private readonly audit: IPrintAudit,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async execute(actor: { id: number; displayName: string }, branchId: number): Promise<{ kickedAt: Date; sentBytes: number }> {
    const settings = await this.printer.current()
    if (!settings.enabled)
      throw new DomainConflictError('ปิดพิมพ์ผ่านแลนอยู่ เปิดในตั้งค่าร้านก่อนเปิดลิ้นชัก', 'PRINTER_DISABLED')
    if (settings.host === null)
      throw new DomainError('ยังไม่ได้กรอก IP เครื่องพิมพ์ในตั้งค่าร้าน', 'INVALID_PRINTER_SETTINGS')

    const sentBytes = await this.kick(settings.host, settings.port, actor, branchId)

    const kickedAt = this.clock.now()
    await this.unitOfWork.run(() =>
      this.audit.record(actor, branchId, { action: 'receipt.drawer_opened', ref: 'manual', saleId: null, sentBytes }),
    )
    return { kickedAt, sentBytes }
  }

  /** Outside every transaction: a stalled printer must never hold the database. */
  private async kick(host: string, port: number, actor: { id: number; displayName: string }, branchId: number): Promise<number> {
    try {
      const { sentBytes } = await this.gateway.sendRaw({
        host,
        port,
        bytes: buildDrawerCommand(),
        timeoutMs: SEND_TIMEOUT_MS,
      })
      return sentBytes
    } catch (error) {
      await this.unitOfWork.run(() =>
        this.audit.record(actor, branchId, {
          action: 'receipt.drawer_failed',
          ref: 'manual',
          saleId: null,
          sentBytes: 0,
          errorCode: error instanceof DomainError ? error.code : 'UNKNOWN_ERROR',
        }),
      )
      throw error
    }
  }
}
