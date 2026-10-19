import { createServer, type Server, type Socket } from 'node:net'

export interface FakePrinter {
  port: number
  /** Raw chunks in arrival order. */
  chunks: Buffer[]
  /** Everything received so far, concatenated. */
  bytes(): Uint8Array
  reset(): void
  stop(): Promise<void>
}

/**
 * A thermal printer that only listens: it records every byte and closes when the client ends,
 * like a real printer finishing a job. Tests point the shop settings at 127.0.0.1 and this port.
 */
export async function startFakePrinter(): Promise<FakePrinter> {
  const chunks: Buffer[] = []
  const server: Server = createServer((socket: Socket) => {
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    socket.on('end', () => socket.end())
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }

  return {
    port,
    chunks,
    bytes: () => new Uint8Array(Buffer.concat(chunks)),
    reset: () => chunks.length = 0,
    stop: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}
