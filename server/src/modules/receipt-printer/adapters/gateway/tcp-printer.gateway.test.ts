import { describe, expect, test } from 'bun:test'
import { createServer, type Server } from 'node:net'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import { TcpPrinterGateway } from './tcp-printer.gateway'

const PAYLOAD = new Uint8Array([0x1d, 0x76, 0x30, 0x00, 0x01])

/** A loopback TCP server that answers every chunk and closes when the client ends. */
async function listen() {
  const chunks: Buffer[] = []
  const server: Server = createServer((socket) => {
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    socket.on('end', () => socket.end())
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  return { port, chunks, close: () => server.close() }
}

async function closedPort() {
  const { port, close } = await listen()
  close()
  // The listener is gone by the time the gateway dials.
  await new Promise((resolve) => setTimeout(resolve, 50))
  return port
}

describe('TcpPrinterGateway', () => {
  test('writes the bytes and reports how many went out', async () => {
    const printer = await listen()
    try {
      const sent = await new TcpPrinterGateway().sendRaw({ host: '127.0.0.1', port: printer.port, bytes: PAYLOAD, timeoutMs: 2000 })

      expect(sent).toEqual({ sentBytes: PAYLOAD.length })
      expect(Buffer.concat(printer.chunks)).toEqual(Buffer.from(PAYLOAD))
    } finally {
      printer.close()
    }
  })

  test('a refused connection is unreachable, with its own code', async () => {
    const port = await closedPort()

    const failure = await new TcpPrinterGateway()
      .sendRaw({ host: '127.0.0.1', port, bytes: PAYLOAD, timeoutMs: 2000 })
      .catch((error) => error)

    expect(failure).toBeInstanceOf(DomainExternalServiceError)
    expect(failure).toMatchObject({ code: 'PRINTER_UNREACHABLE' })
  })

  test('a printer that stops reading mid-transfer is a timeout with an unknown outcome', async () => {
    // A jammed printer stops reading: the backlog fills and the flush never finishes. The server here
    // accepts and never reads, so a payload bigger than every kernel buffer stalls the write.
    const stalled = createServer(() => {})
    await new Promise<void>((resolve) => stalled.listen(0, '127.0.0.1', resolve))
    const { port } = stalled.address() as { port: number }
    try {
      const big = new Uint8Array(16 * 1024 * 1024).fill(0x1d)
      const failure = await new TcpPrinterGateway()
        .sendRaw({ host: '127.0.0.1', port, bytes: big, timeoutMs: 300 })
        .catch((error) => error)

      // Part of the bytes may already be on paper: reporting success would print twice on retry.
      expect(failure).toBeInstanceOf(DomainExternalServiceError)
      expect(failure).toMatchObject({ code: 'PRINTER_TIMEOUT', params: { outcome: 'unknown' } })
    } finally {
      stalled.close()
    }
  })

  test('ping connects and closes without sending anything', async () => {
    const printer = await listen()
    try {
      await new TcpPrinterGateway().ping({ host: '127.0.0.1', port: printer.port, timeoutMs: 2000 })

      expect(printer.chunks).toEqual([])
    } finally {
      printer.close()
    }
  })

  test('ping to a dead port is unreachable', async () => {
    const port = await closedPort()

    const failure = await new TcpPrinterGateway().ping({ host: '127.0.0.1', port, timeoutMs: 2000 }).catch((error) => error)

    expect(failure).toMatchObject({ code: 'PRINTER_UNREACHABLE' })
  })
})
