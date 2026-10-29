// seedLoadData checks the database its handle is connected to, whoever built the handle. No database is used here:
// the handle is a fake that answers the name query and records every other call.
import { expect, test } from 'bun:test'
import type { SQL } from 'bun'
import { seedLoadData } from './seed'

function fakeHandle(databaseName: string) {
  const calls: string[] = []
  const handle = {
    unsafe: async (query: string) => {
      calls.push(query)
      return /current_database\(\)/.test(query) ? [{ name: databaseName }] : []
    },
    begin: async () => {
      calls.push('begin')
      throw new Error('a transaction must not be started')
    },
  }
  return { handle: handle as unknown as SQL, calls }
}

test('seedLoadData refuses a handle connected to a database that is not pos_load*, before writing anything', async () => {
  const { handle, calls } = fakeHandle('pos')
  await expect(seedLoadData(handle, { cashierPassword: 'not-used-here' })).rejects.toThrow('database name')
  expect(calls).toHaveLength(1)
  expect(calls[0]).toContain('current_database()')
})
