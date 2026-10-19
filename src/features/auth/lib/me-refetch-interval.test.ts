import { describe, expect, test } from 'bun:test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { meRefetchInterval } from './me-refetch-interval'

describe('meRefetchInterval', () => {
  test('re-reads the user every 30 seconds while someone is signed in', () => {
    expect(meRefetchInterval({ state: { data: { id: 1 } } })).toBe(30_000)
  })

  test('does not poll while nobody is signed in', () => {
    expect(meRefetchInterval({ state: { data: undefined } })).toBe(false)
  })

  test('is why a failed first read must not be repeated: a query without data turns pending again on every refetch', async () => {
    const client = new QueryClient()
    const observer = new QueryObserver(client, { queryKey: ['me'], queryFn: () => Promise.reject(new Error('401')), retry: false })
    const statuses: string[] = []
    const stop = observer.subscribe((result) => statuses.push(result.status))
    await Bun.sleep(10)
    expect(statuses.at(-1)).toBe('error')

    void observer.refetch()
    expect(observer.getCurrentResult().status).toBe('pending')
    stop()
  })
})
