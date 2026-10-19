import { beforeEach, describe, expect, test } from 'bun:test'
import { mock, type Mock } from 'bun:test'
import { ZodError } from 'zod'
import { mockClock, mockUnitOfWork } from '../../../../__tests__/mocks'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import type { ICommandReceipts } from '../../../shared/ports/command-receipts.port'
import type { IPrinterGateway } from '../ports/printer-gateway.port'
import type { IPrintAudit, PrintAuditEntry } from '../ports/print-audit.port'
import type { IPrinterSettings, PrinterSettings } from '../ports/printer-settings.port'
import { OpenDrawerUseCase } from './open-drawer.usecase'
import { PrintReceiptUseCase } from './print-receipt.usecase'
import { TestPrinterConnectionUseCase } from './test-connection.usecase'

const ACTOR = { id: 7, displayName: 'พนักงานทดสอบ' }
const BRANCH_ID = 1
const NOW = new Date('2026-10-19T08:00:00.000Z')
const KEY = '123e4567-e89b-12d3-a456-426614174000'

const bits = (width: number, height: number, value = true) => new Array(width * height).fill(value) as boolean[]
const input = (overrides: Record<string, unknown> = {}) => ({
  saleId: 42,
  widthDots: 384,
  heightDots: 8,
  bits: bits(384, 8),
  cut: true,
  kickDrawer: true,
  ...overrides,
})

const printerOn: PrinterSettings = { host: '192.168.1.50', port: 9100, enabled: true, drawerEnabled: true }

/** In-memory receipts: lock is a no-op, like concurrent tests that never share a key. */
function memoryReceipts() {
  const rows = new Map<string, { requestHash: string; result: unknown }>()
  const keyOf = (scope: { actorId: number; branchId: number; action: string; key: string }) =>
    `${scope.actorId}:${scope.branchId}:${scope.action}:${scope.key}`
  const receipts: ICommandReceipts = {
    lock: mock(async () => {}),
    find: mock(async (scope) => rows.get(keyOf(scope)) ?? null),
    create: mock(async (scope, requestHash, result) => {
      rows.set(keyOf(scope), { requestHash, result })
    }),
  }
  return { receipts, rows }
}

function setup(settings: PrinterSettings = printerOn) {
  const printer: IPrinterSettings = { current: mock(async () => settings) }
  const gateway: IPrinterGateway & { sendRaw: Mock<IPrinterGateway['sendRaw']>; ping: Mock<IPrinterGateway['ping']> } = {
    sendRaw: mock(async () => ({ sentBytes: 61 })),
    ping: mock(async () => {}),
  }
  const { receipts } = memoryReceipts()
  const audits: { actor: unknown; branchId: number; entry: PrintAuditEntry }[] = []
  const audit: IPrintAudit = { record: mock(async (actor, branchId, entry) => { audits.push({ actor, branchId, entry }) }) }
  const unitOfWork = mockUnitOfWork()
  const clock = mockClock(NOW)
  return {
    printer,
    gateway,
    receipts,
    audits,
    print: new PrintReceiptUseCase(printer, gateway, receipts, audit, unitOfWork, clock),
    drawer: new OpenDrawerUseCase(printer, gateway, audit, unitOfWork, clock),
    test: new TestPrinterConnectionUseCase(printer, gateway),
  }
}

describe('PrintReceiptUseCase', () => {
  test('packs raster, cut and drawer and audits the print', async () => {
    const { print, gateway, audits } = setup()

    const result = await print.execute(input(), ACTOR, BRANCH_ID, KEY)

    expect(result).toEqual({ saleId: 42, sentBytes: 61, printedAt: NOW })
    const sent = gateway.sendRaw.mock.calls[0]?.[0]
    expect(sent?.host).toBe('192.168.1.50')
    expect(sent?.port).toBe(9100)
    // GS v 0 raster, then the partial cut, then the drawer kick.
    expect([...sent!.bytes.slice(0, 4)]).toEqual([0x1d, 0x76, 0x30, 0x00])
    expect([...sent!.bytes.slice(-9)]).toEqual([0x1d, 0x56, 0x42, 0x00, 0x1b, 0x70, 0x00, 0x19, 0xfa])
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      branchId: BRANCH_ID,
      entry: { action: 'receipt.printed', ref: KEY.toLowerCase(), saleId: 42, sentBytes: 61 },
    })
  })

  test('a retry with the same key answers from the record without printing twice', async () => {
    const { print, gateway } = setup()

    const first = await print.execute(input(), ACTOR, BRANCH_ID, KEY.toUpperCase())
    const second = await print.execute(input(), ACTOR, BRANCH_ID, KEY.toLowerCase())

    expect(second).toEqual(first)
    expect(gateway.sendRaw).toHaveBeenCalledTimes(1)
  })

  test('the same key with another bill refuses before touching the printer', async () => {
    const { print, gateway } = setup()
    await print.execute(input(), ACTOR, BRANCH_ID, KEY)

    await expect(print.execute(input({ saleId: 43 }), ACTOR, BRANCH_ID, KEY)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    })
    expect(gateway.sendRaw).toHaveBeenCalledTimes(1)
  })

  test('a key that is not a UUID is refused', async () => {
    const { print, gateway } = setup()

    await expect(print.execute(input(), ACTOR, BRANCH_ID, 'not-a-key')).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    })
    expect(gateway.sendRaw).not.toHaveBeenCalled()
  })

  test('a disabled printer refuses with its own code', async () => {
    const { print, gateway, audits } = setup({ ...printerOn, enabled: false })

    await expect(print.execute(input(), ACTOR, BRANCH_ID, KEY)).rejects.toMatchObject({ code: 'PRINTER_DISABLED' })
    expect(gateway.sendRaw).not.toHaveBeenCalled()
    expect(audits).toHaveLength(0)
  })

  test('an enabled printer with no IP refuses with the settings code', async () => {
    const { print, gateway } = setup({ ...printerOn, host: null })

    await expect(print.execute(input(), ACTOR, BRANCH_ID, KEY)).rejects.toMatchObject({
      code: 'INVALID_PRINTER_SETTINGS',
    })
    expect(gateway.sendRaw).not.toHaveBeenCalled()
  })

  test('a refused connection bubbles up and is audited as failed', async () => {
    const { print, gateway, audits } = setup()
    gateway.sendRaw.mockRejectedValueOnce(
      new DomainExternalServiceError('เชื่อมต่อเครื่องพิมพ์ไม่ได้', 'PRINTER_UNREACHABLE'),
    )

    await expect(print.execute(input(), ACTOR, BRANCH_ID, KEY)).rejects.toMatchObject({
      code: 'PRINTER_UNREACHABLE',
    })
    expect(audits).toHaveLength(1)
    expect(audits[0]?.entry).toMatchObject({
      action: 'receipt.print_failed',
      saleId: 42,
      sentBytes: 0,
      errorCode: 'PRINTER_UNREACHABLE',
    })
  })

  test('skips the drawer kick when the drawer flag is off, and the cut when unasked', async () => {
    const { print, gateway } = setup({ ...printerOn, drawerEnabled: false })

    await print.execute(input({ kickDrawer: true, cut: false }), ACTOR, BRANCH_ID, KEY)

    const sent = gateway.sendRaw.mock.calls[0]?.[0]
    expect([...(sent?.bytes.slice(-5) ?? [])]).not.toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa])
    expect([...(sent?.bytes ?? [])]).not.toContain(0x56)
  })

  test.each([
    ['a zero sale id', { saleId: 0 }],
    ['an unknown width', { widthDots: 512, bits: bits(512, 8) }],
    ['short pixels', { bits: bits(384, 7) }],
    ['an absurd height', { heightDots: 3001, bits: bits(384, 3001) }],
  ])('rejects %s as a validation error before touching the printer', async (_label, overrides) => {
    const { print, gateway } = setup()

    await expect(print.execute(input(overrides), ACTOR, BRANCH_ID, KEY)).rejects.toBeInstanceOf(ZodError)
    expect(gateway.sendRaw).not.toHaveBeenCalled()
  })
})

describe('OpenDrawerUseCase', () => {
  test('kicks the drawer and audits the kick', async () => {
    const { drawer, gateway, audits } = setup()

    const result = await drawer.execute(ACTOR, BRANCH_ID)

    expect(result).toEqual({ kickedAt: NOW, sentBytes: 61 })
    expect([...(gateway.sendRaw.mock.calls[0]?.[0]?.bytes ?? [])]).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa])
    expect(audits[0]?.entry).toMatchObject({ action: 'receipt.drawer_opened', ref: 'manual', saleId: null })
  })

  test('a disabled printer refuses the kick', async () => {
    const { drawer, gateway } = setup({ ...printerOn, enabled: false })

    await expect(drawer.execute(ACTOR, BRANCH_ID)).rejects.toMatchObject({ code: 'PRINTER_DISABLED' })
    expect(gateway.sendRaw).not.toHaveBeenCalled()
  })

  test('a failed kick is audited as failed and rethrown', async () => {
    const { drawer, gateway, audits } = setup()
    gateway.sendRaw.mockRejectedValueOnce(new DomainConflictError('x', 'PRINTER_UNREACHABLE'))

    await expect(drawer.execute(ACTOR, BRANCH_ID)).rejects.toMatchObject({ code: 'PRINTER_UNREACHABLE' })
    expect(audits[0]?.entry).toMatchObject({ action: 'receipt.drawer_failed', errorCode: 'PRINTER_UNREACHABLE' })
  })
})

describe('TestPrinterConnectionUseCase', () => {
  test('pings the configured printer and answers ok', async () => {
    const { test, gateway } = setup()

    await expect(test.execute()).resolves.toEqual({ ok: true })
    expect(gateway.ping).toHaveBeenCalledWith({ host: '192.168.1.50', port: 9100, timeoutMs: 5000 })
  })

  test('a disabled printer refuses the test', async () => {
    const { test, gateway } = setup({ ...printerOn, enabled: false })

    await expect(test.execute()).rejects.toMatchObject({ code: 'PRINTER_DISABLED' })
    expect(gateway.ping).not.toHaveBeenCalled()
  })

  test('a missing IP refuses with the settings code', async () => {
    const { test, gateway } = setup({ ...printerOn, host: null })

    await expect(test.execute()).rejects.toMatchObject({ code: 'INVALID_PRINTER_SETTINGS' })
    expect(gateway.ping).not.toHaveBeenCalled()
  })
})
