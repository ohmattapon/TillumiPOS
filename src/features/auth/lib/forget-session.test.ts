import { describe, expect, test } from 'bun:test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { forgetSession } from './forget-session'

const ME = ['auth', 'me'] as const
const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('forgetSession', () => {
  test('tells whoever watches the signed-in user that nobody is signed in, so the login page shows', async () => {
    const queryClient = new QueryClient()
    const me = new QueryObserver(queryClient, { queryKey: ME, queryFn: async () => ({ id: 1 }), staleTime: Infinity })
    const unsubscribe = me.subscribe(() => {})
    await settle()
    expect(me.getCurrentResult().data).toEqual({ id: 1 })

    forgetSession(queryClient, ME)
    await settle()

    expect(me.getCurrentResult().data).toBeNull()
    unsubscribe()
  })

  test('drops every other cached query so the next user never sees the last one\'s data', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(ME, { id: 1 })
    queryClient.setQueryData(['products'], [{ id: 7 }])

    forgetSession(queryClient, ME)

    expect(queryClient.getQueryData(['products'])).toBeUndefined()
  })

  test('keeps the signed-in user query in place, so the next login reaches the same watcher', async () => {
    const queryClient = new QueryClient()
    const me = new QueryObserver(queryClient, { queryKey: ME, queryFn: async () => ({ id: 1 }), staleTime: Infinity })
    const unsubscribe = me.subscribe(() => {})
    await settle()

    forgetSession(queryClient, ME)
    queryClient.setQueryData(ME, { id: 2 })
    await settle()

    expect(me.getCurrentResult().data).toEqual({ id: 2 })
    unsubscribe()
  })
})
