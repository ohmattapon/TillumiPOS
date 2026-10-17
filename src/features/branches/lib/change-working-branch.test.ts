import { expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { changeWorkingBranch } from './change-working-branch'

test('a forced fallback clears data from the previous branch while preserving the session', async () => {
  const client = new QueryClient()
  client.setQueryData(['sales', 'today'], { branch: 2 })
  client.setQueryData(['products', 'list'], { branch: 2 })
  client.setQueryData(['shifts', 'current'], { branch: 2 })
  client.setQueryData(['auth', 'me'], { id: 1 })
  client.setQueryData(['settings'], { locale: 'th' })
  let selected: number | null = 2
  await changeWorkingBranch(client, (value) => { selected = value }, null)
  expect(selected).toBeNull()
  for (const key of ['sales', 'products', 'shifts']) expect(client.getQueryData([key, key === 'sales' ? 'today' : key === 'products' ? 'list' : 'current'])).toBeUndefined()
  expect(client.getQueryData(['auth', 'me'])).toEqual({ id: 1 })
  expect(client.getQueryData(['settings'])).toEqual({ locale: 'th' })
  client.clear()
})
