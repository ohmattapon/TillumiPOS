import { expect, test } from 'bun:test'
import { queryClient } from './query-client'

test('server data is reused for half a minute and not refetched on every window focus', () => {
  expect(queryClient.getDefaultOptions().queries).toMatchObject({ staleTime: 30_000, refetchOnWindowFocus: false })
})
