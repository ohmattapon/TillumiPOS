import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'
import { buildCutCommand, buildDrawerCommand, buildRasterCommand } from '../../../../domains/receipt-raster.domain'
import { isIdempotencyKey } from '../../../shared/applications/command-idempotency'
import type { ICommandReceipts } from '../../../shared/ports/command-receipts.port'
import { commandReceiptsToken } from '../../../shared/ports/command-receipts.port'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { printAuditToken, type IPrintAudit } from '../ports/print-audit.port'
import { printerGatewayToken, type IPrinterGateway } from '../ports/printer-gateway.port'
import { printerSettingsToken, type IPrinterSettings } from '../ports/printer-settings.port'
import { printReceiptSchema } from '../schemas/printer-schemas'

export interface PrintedReceipt {
  saleId: number
  sentBytes: number
  printedAt: Date
}

const PRINT_SCOPE = 'receipt-printer.print'
const SEND_TIMEOUT_MS = 5000

const keyRequired = () => new DomainError('กรุณาส่ง Idempotency-Key เป็น UUID', 'IDEMPOTENCY_KEY_REQUIRED')
const reused = () => new DomainConflictError('Idempotency-Key นี้ถูกใช้กับข้อมูลคำขอชุดอื่นแล้ว', 'IDEMPOTENCY_KEY_REUSED')
const disabled = () => new DomainConflictError('ปิดพิมพ์ผ่านแลนอยู่ เปิดในตั้งค่าร้านก่อนสั่งพิมพ์', 'PRINTER_DISABLED')
const noHost = () => new DomainError('ยังไม่ได้กรอก IP เครื่องพิมพ์ในตั้งค่าร้าน', 'INVALID_PRINTER_SETTINGS')

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/**
 * Command: prints a till-rendered receipt on the LAN thermal printer.
 *
 * The till renders the receipt to 1-bit pixels, so the server only packs bytes and forwards them:
 * it never reads the bill, and a failed print can neither lose nor duplicate one. The network send
 * runs outside every transaction; the same key with the same print answers from the stored record
 * instead of printing twice, and a timeout answers `PRINTER_TIMEOUT` with an unknown outcome.
 */
@injectable()
export class PrintReceiptUseCase {
  constructor(
    @inject(printerSettingsToken) private readonly printer: IPrinterSettings,
    @inject(printerGatewayToken) private readonly gateway: IPrinterGateway,
    @inject(commandReceiptsToken) private readonly receipts: ICommandReceipts,
    @inject(printAuditToken) private readonly audit: IPrintAudit,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async execute(
    input: unknown,
    actor: { id: number; displayName: string },
    branchId: number,
    idempotencyKey: string,
  ): Promise<PrintedReceipt> {
    const dto = printReceiptSchema.parse(input)
    if (!isIdempotencyKey(idempotencyKey)) throw keyRequired()
    const key = idempotencyKey.toLowerCase()
    const scope = { actorId: actor.id, branchId, action: PRINT_SCOPE, key }
    // What makes this print this print: same key + same bill, size and options replays, anything else refuses.
    const fingerprint = `${dto.saleId}:${dto.widthDots}x${dto.heightDots}:${dto.bits.length}:${dto.cut}:${dto.kickDrawer}`

    // A read-only look first: the common retry answers here, before touching the printer.
    const prior = await this.unitOfWork.run(async () => {
      await this.receipts.lock(scope)
      return this.receipts.find(scope)
    })
    if (prior) return this.replay(prior.requestHash, prior.result, fingerprint, dto.saleId)

    const sentBytes = await this.send(dto, actor, branchId, key)
    return this.recordPrint(dto.saleId, sentBytes, { scope, fingerprint, actor, branchId, key })
  }

  /** Outside every transaction: a stalled printer must never hold the database. */
  private async send(
    dto: ReturnType<typeof printReceiptSchema.parse>,
    actor: { id: number; displayName: string },
    branchId: number,
    key: string,
  ): Promise<number> {
    const settings = await this.printer.current()
    if (!settings.enabled) throw disabled()
    if (settings.host === null) throw noHost()

    const parts = [buildRasterCommand(dto.widthDots, dto.heightDots, dto.bits)]
    if (dto.cut) parts.push(buildCutCommand())
    if (dto.kickDrawer && settings.drawerEnabled) parts.push(buildDrawerCommand())

    try {
      const { sentBytes } = await this.gateway.sendRaw({
        host: settings.host,
        port: settings.port,
        bytes: concat(parts),
        timeoutMs: SEND_TIMEOUT_MS,
      })
      return sentBytes
    } catch (error) {
      await this.unitOfWork.run(() =>
        this.audit.record(actor, branchId, {
          action: 'receipt.print_failed',
          ref: key,
          saleId: dto.saleId,
          sentBytes: 0,
          errorCode: error instanceof DomainError ? error.code : 'UNKNOWN_ERROR',
        }),
      )
      throw error
    }
  }

  private async recordPrint(
    saleId: number,
    sentBytes: number,
    ctx: {
      scope: { actorId: number; branchId: number; action: string; key: string }
      fingerprint: string
      actor: { id: number; displayName: string }
      branchId: number
      key: string
    },
  ): Promise<PrintedReceipt> {
    const printedAt = this.clock.now()
    return this.unitOfWork.run(async () => {
      await this.receipts.lock(ctx.scope)
      // A twin request that finished first wins; this send may have doubled it, but the answer stays single.
      const twin = await this.receipts.find(ctx.scope)
      if (twin) return this.replay(twin.requestHash, twin.result, ctx.fingerprint, saleId)
      await this.receipts.create(ctx.scope, ctx.fingerprint, { sentBytes, printedAt: printedAt.toISOString() })
      await this.audit.record(ctx.actor, ctx.branchId, {
        action: 'receipt.printed',
        ref: ctx.key,
        saleId,
        sentBytes,
      })
      return { saleId, sentBytes, printedAt }
    })
  }

  private replay(storedHash: string, stored: unknown, fingerprint: string, saleId: number): PrintedReceipt {
    if (storedHash !== fingerprint) throw reused()
    const result = stored as { sentBytes: number; printedAt: string }
    return { saleId, sentBytes: result.sentBytes, printedAt: new Date(result.printedAt) }
  }
}
