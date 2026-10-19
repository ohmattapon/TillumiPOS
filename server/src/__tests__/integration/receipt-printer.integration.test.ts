import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, signIn, type Session } from '../../../test/harness'
import { startFakePrinter, type FakePrinter } from '../../../test/fake-printer-server'

let owner: Session
let printer: FakePrinter

beforeAll(async () => {
  printer = await startFakePrinter()
})

afterAll(async () => {
  await printer.stop()
})

beforeEach(async () => {
  await resetDatabase()
  printer.reset()
  owner = await signIn('owner')
})

const key = () => ({ headers: { 'idempotency-key': crypto.randomUUID() } })
const bits = (width: number, height: number) => new Array(width * height).fill(true) as boolean[]
const body = () => ({ saleId: 1, widthDots: 384 as const, heightDots: 8, bits: bits(384, 8), cut: true, kickDrawer: true })

async function enablePrinter(port: number) {
  return ok(
    await owner.api.settings.patch({
      receiptPrinterIp: '127.0.0.1',
      receiptPrinterPort: port,
      receiptPrinterEnabled: true,
      cashDrawerEnabled: true,
    }),
  )
}

describe('receipt printer', () => {
  test('prints raster, cut and drawer through the fake printer', async () => {
    await enablePrinter(printer.port)

    const printed = ok(await owner.api['receipt-printer'].print.post(body(), key()))

    expect(printed.saleId).toBe(1)
    expect(printed.sentBytes).toBe(printer.bytes().length)
    expect(typeof printed.printedAt).toBe('string')
    const bytes = [...printer.bytes()]
    // GS v 0 raster first, then the partial cut, then the drawer kick.
    expect(bytes.slice(0, 4)).toEqual([0x1d, 0x76, 0x30, 0x00])
    expect(bytes.slice(-9)).toEqual([0x1d, 0x56, 0x42, 0x00, 0x1b, 0x70, 0x00, 0x19, 0xfa])
  })

  test('the same key replays without sending to the printer twice', async () => {
    await enablePrinter(printer.port)
    const once = key()

    const first = ok(await owner.api['receipt-printer'].print.post(body(), once))
    const sent = printer.bytes().length
    const second = ok(await owner.api['receipt-printer'].print.post(body(), once))

    expect(second).toEqual(first)
    expect(printer.bytes().length).toBe(sent)
  })

  test('a disabled printer refuses with its own code and sends nothing', async () => {
    const result = await owner.api['receipt-printer'].print.post(body(), key())

    expect(result.status).toBe(409)
    expect(result.error?.value).toMatchObject({ code: 'PRINTER_DISABLED' })
    expect(printer.bytes().length).toBe(0)
  })

  test('opening the drawer kicks without printing a receipt', async () => {
    await enablePrinter(printer.port)

    const kicked = ok(await owner.api['receipt-printer']['drawer'].open.post())

    expect(kicked.sentBytes).toBe(5)
    expect([...printer.bytes()]).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa])
  })

  test('the connection test answers ok for a listening printer', async () => {
    await enablePrinter(printer.port)

    expect(ok(await owner.api['receipt-printer']['test-connection'].post())).toEqual({ ok: true })
    expect(printer.bytes().length).toBe(0)
  })

  test('an unreachable printer answers that it is unreachable', async () => {
    // A port nobody listens on: the OS refuses the connection, so nothing was sent.
    const dead = await startFakePrinter()
    const port = dead.port
    await dead.stop()
    await enablePrinter(port)

    const result = await owner.api['receipt-printer'].print.post(body(), key())

    expect(result.status).toBe(502)
    expect(result.error?.value).toMatchObject({ code: 'PRINTER_UNREACHABLE' })
  })
})
