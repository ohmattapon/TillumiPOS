import { createHash } from 'node:crypto'
import { DomainConflictError } from '../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../domains/errors/domain-error'
import { inject, injectable } from 'tsyringe'
import type { CommandScope, ICommandReceipts } from '../ports/command-receipts.port'
import { commandReceiptsToken } from '../ports/command-receipts.port'

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}

function requestHash(value: unknown): string {
  const body = JSON.stringify(canonical(value))
  return createHash('sha256').update(body).digest('hex')
}

/** Replays successful command results inside the caller's UOW and binds a key to one actor, action and request body. */
@injectable()
export class CommandIdempotency {
  constructor(@inject(commandReceiptsToken) private readonly receipts: ICommandReceipts) {}

  async execute<T, Stored>(
    scope: CommandScope,
    input: unknown,
    command: () => Promise<T>,
    serialize: (result: T) => Stored,
    restore: (result: unknown) => Promise<T>,
  ): Promise<T> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scope.key))
      throw new DomainError('กรุณาส่ง Idempotency-Key เป็น UUID', 'IDEMPOTENCY_KEY_REQUIRED')
    const normalizedScope = { ...scope, key: scope.key.toLowerCase() }
    const hash = requestHash(input)
    await this.receipts.lock(normalizedScope)
    const prior = await this.receipts.find(normalizedScope)
    if (prior) {
      if (prior.requestHash !== hash)
        throw new DomainConflictError('Idempotency-Key นี้ถูกใช้กับข้อมูลคำขอชุดอื่นแล้ว', 'IDEMPOTENCY_KEY_REUSED')
      return restore(prior.result)
    }
    const result = await command()
    await this.receipts.create(normalizedScope, hash, serialize(result))
    return result
  }
}
