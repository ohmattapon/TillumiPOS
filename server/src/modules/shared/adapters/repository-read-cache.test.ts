import { describe, expect, mock, test } from 'bun:test'
import type { IReadCache } from '../ports/read-cache.port'
import { RepositoryReadCache } from './repository-read-cache'

const fakeStore = (overrides: Partial<IReadCache> = {}): IReadCache => ({
  lookup: mock(async () => ({ revision: 'r1', value: null })),
  store: mock(async () => {}),
  invalidate: mock(async () => {}),
  close: mock(() => {}),
  ...overrides,
})

const read = (cache: RepositoryReadCache, serialize: (value: number) => unknown = (value) => value) =>
  cache.read('products', 'k', 30, async () => 7, serialize, (value) => value as number)

describe('RepositoryReadCache filling the store', () => {
  test('a miss is answered from the database and stored for next time', async () => {
    const store = fakeStore()

    expect(await read(new RepositoryReadCache(store))).toBe(7)

    expect(store.store).toHaveBeenCalledWith('products', 'k', 'r1', '7', 30)
  })

  test('a store that fails does not fail the read', async () => {
    const store = fakeStore({ store: mock(async () => { throw new Error('redis down') }) })

    expect(await read(new RepositoryReadCache(store))).toBe(7)
  })

  test('a value that cannot be serialized is simply not cached', async () => {
    const store = fakeStore()

    const answer = await read(new RepositoryReadCache(store), () => { throw new TypeError('circular') })

    expect(answer).toBe(7)
    expect(store.store).not.toHaveBeenCalled()
  })
})
