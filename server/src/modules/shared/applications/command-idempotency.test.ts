import { describe, expect, test } from 'bun:test'
import { CommandIdempotency } from './command-idempotency'

const scope = { actorId: 1, branchId: 2, action: 'shifts.open', key: '55f58cf4-4f55-482c-b722-1ca805925556' }

function memoryReceipts() {
  let record: { requestHash: string; result: unknown } | null = null
  return {
    lock: async () => {},
    find: async () => record,
    create: async (_scope: unknown, requestHash: string, result: unknown) => { record = { requestHash, result } },
  }
}

describe('CommandIdempotency', () => {
  test('replays a successful result without running the command again', async () => {
    const command = new CommandIdempotency(memoryReceipts())
    let calls = 0
    const run = () => { calls += 1; return Promise.resolve({ id: 9 }) }
    const encode = (value: { id: number }) => ({ id: value.id })
    const decode = async (value: unknown) => value as { id: number }

    expect(await command.execute(scope, { amount: 10 }, run, encode, decode)).toEqual({ id: 9 })
    expect(await command.execute(scope, { amount: 10 }, run, encode, decode)).toEqual({ id: 9 })
    expect(calls).toBe(1)
  })

  test('rejects reusing a key for a different request body', async () => {
    const command = new CommandIdempotency(memoryReceipts())
    const operation = () => command.execute(scope, { amount: 11 }, async () => ({ id: 10 }), (value) => value, async (value) => value as { id: number })

    await command.execute(scope, { amount: 10 }, async () => ({ id: 9 }), (value) => value, async (value) => value as { id: number })
    await expect(operation()).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
  })

  test('requires a UUID idempotency key', async () => {
    const command = new CommandIdempotency(memoryReceipts())

    await expect(command.execute({ ...scope, key: 'bad' }, {}, async () => 1, (value) => value, async (value) => value as number))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' })
  })
})
